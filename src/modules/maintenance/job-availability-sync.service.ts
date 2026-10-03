import type { PrismaClient } from '@prisma/client';
import type { JobSourceRegistry } from '../../integrations/job-sources/job-source.registry.js';
import type { AppLogger } from '../../shared/logger.js';
import { AuditService } from '../audit/audit.service.js';

export interface JobAvailabilitySyncResult {
  sourcesChecked: number;
  jobsChecked: number;
  active: number;
  closed: number;
  unknown: number;
  failures: number;
}

export class JobAvailabilitySyncService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient,
    private readonly registry: JobSourceRegistry,
    private readonly logger: AppLogger,
  ) {
    this.audit = new AuditService(db);
  }

  async run(limitPerSource = 100): Promise<JobAvailabilitySyncResult> {
    const result: JobAvailabilitySyncResult = {
      sourcesChecked: 0,
      jobsChecked: 0,
      active: 0,
      closed: 0,
      unknown: 0,
      failures: 0,
    };

    const sources = await this.db.jobSource.findMany({
      where: { enabled: true },
      orderBy: { slug: 'asc' },
    });

    for (const source of sources) {
      const adapter = this.registry.getAdapter(source.slug);
      if (!adapter?.checkJobStatuses) continue;

      const references = await this.db.jobSourceReference.findMany({
        where: {
          sourceId: source.id,
          externalId: { not: null },
          job: { isActive: true },
        },
        select: {
          id: true,
          jobId: true,
          externalId: true,
          job: { select: { status: true } },
        },
        orderBy: {
          statusCheckedAt: { sort: 'asc', nulls: 'first' },
        },
        take: limitPerSource,
      });
      if (!references.length) continue;

      result.sourcesChecked += 1;
      try {
        const statuses = await adapter.checkJobStatuses(
          references.flatMap((reference) => (reference.externalId ? [reference.externalId] : [])),
        );
        const byExternalId = new Map(statuses.map((status) => [status.externalId, status]));
        const checkedAt = new Date();

        for (const reference of references) {
          if (!reference.externalId) continue;
          const external = byExternalId.get(reference.externalId);
          if (!external) continue;
          result.jobsChecked += 1;

          await this.db.jobSourceReference.update({
            where: { id: reference.id },
            data: {
              statusCheckedAt: checkedAt,
              externalStatus: external.status,
            },
          });

          if (external.status === 'ACTIVE') {
            result.active += 1;
            await this.db.job.update({
              where: { id: reference.jobId },
              data: {
                isActive: true,
                lastSeenAt: checkedAt,
                ...(reference.job.status === 'STALE' || reference.job.status === 'CLOSED'
                  ? { status: 'PENDING_ANALYSIS' as const }
                  : {}),
              },
            });
            continue;
          }

          if (external.status === 'CLOSED') {
            result.closed += 1;
            const otherUnconfirmedReferences = await this.db.jobSourceReference.count({
              where: {
                jobId: reference.jobId,
                id: { not: reference.id },
                OR: [{ externalStatus: null }, { externalStatus: { not: 'CLOSED' } }],
              },
            });
            if (otherUnconfirmedReferences === 0) {
              await this.db.job.update({
                where: { id: reference.jobId },
                data: { status: 'CLOSED', isActive: false },
              });
              await this.audit.record('JOB_SOURCE_STATUS_CLOSED', 'Job', reference.jobId, {
                source: source.slug,
                externalId: reference.externalId,
              });
            }
            continue;
          }

          result.unknown += 1;
        }
      } catch (error) {
        result.failures += 1;
        this.logger.warn(
          { err: error, source: source.slug },
          'Falha ao sincronizar disponibilidade de vagas',
        );
      }
    }

    return result;
  }
}
