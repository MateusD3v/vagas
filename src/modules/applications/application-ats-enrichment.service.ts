import type { Prisma, PrismaClient } from '@prisma/client';
import type { AtsJobResolverService, ResolvedJobUrl } from '../jobs/ats-job-resolver.service.js';
import type { AppLogger } from '../../shared/logger.js';
import { classifyApplicationChannel, readFastApplyHint } from './application-channel.js';
import { AuditService } from '../audit/audit.service.js';

const ATS_ENRICHMENT_CACHE_MS = 24 * 60 * 60 * 1000;

type Resolver = Pick<AtsJobResolverService, 'resolve'>;

interface AtsEnrichmentState {
  applicationUrl?: string;
  checkedAt?: string;
}

function jsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function readEnrichmentState(rawData: Prisma.JsonValue): AtsEnrichmentState | null {
  const value = jsonObject(rawData).atsEnrichment;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value;
  return {
    applicationUrl: typeof record.applicationUrl === 'string' ? record.applicationUrl : undefined,
    checkedAt: typeof record.checkedAt === 'string' ? record.checkedAt : undefined,
  };
}

function shouldRefresh(rawData: Prisma.JsonValue, applicationUrl: string, now: Date): boolean {
  const state = readEnrichmentState(rawData);
  if (!state || state.applicationUrl !== applicationUrl || !state.checkedAt) return true;
  const checkedAt = Date.parse(state.checkedAt);
  if (Number.isNaN(checkedAt)) return true;
  return now.getTime() - checkedAt >= ATS_ENRICHMENT_CACHE_MS;
}

function inputJsonObject(value: Prisma.JsonValue): Prisma.InputJsonObject {
  return jsonObject(value);
}

function resolvedMetadata(
  resolved: ResolvedJobUrl,
  applicationUrl: string,
  checkedAt: Date,
): Prisma.InputJsonObject {
  return {
    status: resolved.supported ? 'SUPPORTED' : 'UNSUPPORTED',
    supported: resolved.supported,
    platform: resolved.platform,
    flow: resolved.flow,
    applicationUrl,
    checkedAt: checkedAt.toISOString(),
    missingFields: resolved.missingFields,
    ...(resolved.message ? { message: resolved.message } : {}),
  };
}

export interface AtsEnrichmentBatchResult {
  attempted: number;
  enriched: number;
  supported: number;
  questionsFound: number;
  skipped: number;
  failed: number;
  failures: Array<{ applicationId: string; message: string }>;
}

export class ApplicationAtsEnrichmentService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient,
    private readonly resolver: Resolver,
    private readonly logger: AppLogger,
  ) {
    this.audit = new AuditService(db);
  }

  async enrichPending(limit = 25): Promise<AtsEnrichmentBatchResult> {
    const now = new Date();
    const candidates = await this.db.application.findMany({
      where: {
        status: { in: ['READY', 'REVIEW_REQUIRED'] },
        candidate: { isDemo: false },
        job: { applicationUrl: { not: null } },
      },
      include: {
        job: {
          select: {
            id: true,
            source: true,
            applicationUrl: true,
            rawData: true,
          },
        },
      },
      orderBy: [{ matchScore: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(limit * 4, limit),
    });

    const pending = candidates
      .filter((item) => {
        const applicationUrl = item.job.applicationUrl;
        if (!applicationUrl) return false;
        const channel = classifyApplicationChannel(
          applicationUrl,
          item.job.source,
          readFastApplyHint(item.job.rawData),
        );
        return channel.flow === 'ATS' && shouldRefresh(item.job.rawData, applicationUrl, now);
      })
      .slice(0, limit);

    const result: AtsEnrichmentBatchResult = {
      attempted: pending.length,
      enriched: 0,
      supported: 0,
      questionsFound: 0,
      skipped: Math.max(0, candidates.length - pending.length),
      failed: 0,
      failures: [],
    };

    for (const item of pending) {
      const applicationUrl = item.job.applicationUrl;
      if (!applicationUrl) continue;

      try {
        const resolved = await this.resolver.resolve(applicationUrl);
        const questions = resolved.applicationQuestions ?? [];
        const rawData = inputJsonObject(item.job.rawData);
        const nextRawData: Prisma.InputJsonObject = {
          ...rawData,
          atsEnrichment: resolvedMetadata(resolved, applicationUrl, new Date()),
          applicationChannel: {
            platform: resolved.platform,
            flow: resolved.flow,
          },
          ...(questions.length ? { applicationQuestions: questions } : {}),
        };

        await this.db.job.update({
          where: { id: item.job.id },
          data: { rawData: nextRawData },
        });

        result.enriched += 1;
        if (resolved.supported) result.supported += 1;
        result.questionsFound += questions.length;

        await this.audit.record('APPLICATION_UPDATED', 'Application', item.id, {
          reason: 'ATS_ENRICHMENT',
          jobId: item.job.id,
          platform: resolved.platform,
          supported: resolved.supported,
          questionsFound: questions.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        result.failed += 1;
        result.failures.push({ applicationId: item.id, message });

        const rawData = inputJsonObject(item.job.rawData);
        await this.db.job
          .update({
            where: { id: item.job.id },
            data: {
              rawData: {
                ...rawData,
                atsEnrichment: {
                  status: 'FAILED',
                  applicationUrl,
                  checkedAt: new Date().toISOString(),
                  message,
                },
              },
            },
          })
          .catch(() => undefined);

        this.logger.warn(
          { err: error, applicationId: item.id, jobId: item.job.id },
          'Falha ao enriquecer candidatura via ATS público',
        );
      }
    }

    return result;
  }
}
