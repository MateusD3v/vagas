import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobSourceHttpClient } from '../../integrations/job-sources/shared/http-client.js';
import { stripHtml } from '../../integrations/job-sources/shared/normalization.js';
import type { AppLogger } from '../../shared/logger.js';
import { AuditService } from '../audit/audit.service.js';

const APPLY_URL_RESOLUTION_CACHE_MS = 24 * 60 * 60 * 1000;

type HttpClient = Pick<JobSourceHttpClient, 'getText'>;

function jsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function stringField(value: Prisma.JsonValue, key: string): string | null {
  const field = jsonObject(value)[key];
  return typeof field === 'string' ? field : null;
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostname(value: string): string {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function externalApplyUrlFromRemotive(html: string, pageUrl: string): string | null {
  const pageHost = hostname(pageUrl);
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    const href = decodeHtmlAttribute(match[1] ?? '');
    const label = stripHtml(match[2] ?? '')
      .trim()
      .toLowerCase();
    if (!label.includes('apply for this position')) continue;

    try {
      const resolved = new URL(href, pageUrl);
      if (!['http:', 'https:'].includes(resolved.protocol)) continue;
      if (resolved.hostname.toLowerCase().replace(/^www\./, '') === pageHost) continue;
      return resolved.toString();
    } catch {
      continue;
    }
  }

  return null;
}

interface ResolutionState {
  checkedAt?: string;
  sourceUrl?: string;
}

function resolutionState(rawData: Prisma.JsonValue): ResolutionState | null {
  const value = jsonObject(rawData).applyUrlResolution;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    checkedAt: typeof value.checkedAt === 'string' ? value.checkedAt : undefined,
    sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : undefined,
  };
}

function recentlyChecked(rawData: Prisma.JsonValue, sourceUrl: string, now: Date): boolean {
  const state = resolutionState(rawData);
  if (!state?.checkedAt || state.sourceUrl !== sourceUrl) return false;
  const checkedAt = Date.parse(state.checkedAt);
  return !Number.isNaN(checkedAt) && now.getTime() - checkedAt < APPLY_URL_RESOLUTION_CACHE_MS;
}

export interface ApplyUrlResolutionBatchResult {
  attempted: number;
  resolved: number;
  unchanged: number;
  skipped: number;
  failed: number;
  failures: Array<{ applicationId: string; message: string }>;
}

export class ApplicationApplyUrlResolutionService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient,
    private readonly http: HttpClient,
    private readonly logger: AppLogger,
  ) {
    this.audit = new AuditService(db);
  }

  async resolvePending(limit = 25): Promise<ApplyUrlResolutionBatchResult> {
    const now = new Date();
    const candidates = await this.db.application.findMany({
      where: {
        status: { in: ['READY', 'REVIEW_REQUIRED'] },
        candidate: { isDemo: false },
        job: {
          source: { in: ['remoteok', 'remotive'] },
          applicationUrl: { not: null },
        },
      },
      include: {
        job: {
          select: {
            id: true,
            source: true,
            applicationUrl: true,
            originalUrl: true,
            rawData: true,
          },
        },
      },
      orderBy: [{ matchScore: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(limit * 4, limit),
    });

    const result: ApplyUrlResolutionBatchResult = {
      attempted: 0,
      resolved: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    };

    for (const item of candidates) {
      if (result.attempted >= limit) {
        result.skipped += 1;
        continue;
      }

      const currentUrl = safeHttpUrl(item.job.applicationUrl);
      if (!currentUrl) {
        result.skipped += 1;
        continue;
      }

      let resolvedUrl: string | null = null;
      let shouldAttempt = false;

      if (item.job.source === 'remoteok') {
        const storedApplyUrl = safeHttpUrl(stringField(item.job.rawData, 'applyUrl'));
        if (!storedApplyUrl || storedApplyUrl === currentUrl) {
          result.unchanged += 1;
          continue;
        }
        resolvedUrl = storedApplyUrl;
        shouldAttempt = true;
      } else if (item.job.source === 'remotive' && hostname(currentUrl) === 'remotive.com') {
        if (recentlyChecked(item.job.rawData, currentUrl, now)) {
          result.skipped += 1;
          continue;
        }
        shouldAttempt = true;
      }

      if (!shouldAttempt) {
        result.skipped += 1;
        continue;
      }

      result.attempted += 1;

      try {
        if (!resolvedUrl) {
          const html = await this.http.getText(currentUrl, {
            source: 'remotive-apply-url-resolver',
            requestsPerSecond: 1,
            headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
          });
          resolvedUrl = externalApplyUrlFromRemotive(html, currentUrl);
        }

        const rawData: Prisma.InputJsonObject = {
          ...jsonObject(item.job.rawData),
          applyUrlResolution: {
            sourceUrl: currentUrl,
            resolvedUrl,
            status: resolvedUrl ? 'RESOLVED' : 'NO_EXTERNAL_LINK',
            checkedAt: new Date().toISOString(),
          },
        };

        if (!resolvedUrl || resolvedUrl === currentUrl) {
          await this.db.job.update({
            where: { id: item.job.id },
            data: { rawData },
          });
          result.unchanged += 1;
          continue;
        }

        await this.db.job.update({
          where: { id: item.job.id },
          data: {
            applicationUrl: resolvedUrl,
            originalUrl: item.job.originalUrl ?? currentUrl,
            rawData,
          },
        });
        result.resolved += 1;

        await this.audit.record('APPLICATION_UPDATED', 'Application', item.id, {
          reason: 'APPLY_URL_RESOLVED',
          jobId: item.job.id,
          source: item.job.source,
          previousUrl: currentUrl,
          applicationUrl: resolvedUrl,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        result.failed += 1;
        result.failures.push({ applicationId: item.id, message });

        const rawData: Prisma.InputJsonObject = {
          ...jsonObject(item.job.rawData),
          applyUrlResolution: {
            sourceUrl: currentUrl,
            status: 'FAILED',
            checkedAt: new Date().toISOString(),
            message,
          },
        };
        await this.db.job
          .update({
            where: { id: item.job.id },
            data: { rawData },
          })
          .catch(() => undefined);

        this.logger.warn(
          { err: error, applicationId: item.id, jobId: item.job.id, source: item.job.source },
          'Falha ao resolver URL externa de candidatura',
        );
      }
    }

    return result;
  }
}
