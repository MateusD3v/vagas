import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { JobSourceAdapter } from '../src/integrations/job-sources/job-source.interface.js';
import { JobSourceRegistry } from '../src/integrations/job-sources/job-source.registry.js';
import { JobAvailabilitySyncService } from '../src/modules/maintenance/job-availability-sync.service.js';
import type { AppLogger } from '../src/shared/logger.js';

const logger: AppLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function adapter(): JobSourceAdapter {
  return {
    source: 'jobicy',
    sourceName: 'jobicy',
    capabilities: {
      supportsKeywordSearch: true,
      supportsLocationSearch: false,
      supportsRemoteFilter: true,
      supportsPublishedAfter: false,
      supportsPagination: true,
    },
    rateLimit: { requestsPerSecond: 1, concurrency: 1 },
    searchJobs: vi.fn().mockResolvedValue([]),
    normalizeJob: vi.fn() as JobSourceAdapter['normalizeJob'],
    checkJobStatuses: vi.fn().mockResolvedValue([
      { externalId: '10', status: 'ACTIVE' },
      { externalId: '11', status: 'CLOSED' },
      { externalId: '12', status: 'UNKNOWN' },
    ]),
  };
}

describe('JobAvailabilitySyncService', () => {
  it('mantém vagas ativas, fecha as confirmadas e não fecha unknown', async () => {
    const updateReference = vi.fn().mockResolvedValue({});
    const updateJob = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const db = {
      jobSource: {
        findMany: vi.fn().mockResolvedValue([{ id: 'source-1', slug: 'jobicy', enabled: true }]),
      },
      jobSourceReference: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'ref-10', jobId: 'job-10', externalId: '10', job: { status: 'ANALYZED' } },
          { id: 'ref-11', jobId: 'job-11', externalId: '11', job: { status: 'ANALYZED' } },
          { id: 'ref-12', jobId: 'job-12', externalId: '12', job: { status: 'ANALYZED' } },
        ]),
        update: updateReference,
        count: vi.fn().mockResolvedValue(0),
      },
      job: { update: updateJob },
      auditLog: { create: auditCreate },
    } as unknown as PrismaClient;

    const registry = new JobSourceRegistry().register(adapter());
    const result = await new JobAvailabilitySyncService(db, registry, logger).run(100);

    expect(result).toMatchObject({
      sourcesChecked: 1,
      jobsChecked: 3,
      active: 1,
      closed: 1,
      unknown: 1,
      failures: 0,
    });
    expect(updateReference).toHaveBeenCalledTimes(3);
    expect(updateJob).toHaveBeenCalledTimes(2);
    expect(updateJob.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'job-10' },
      data: { isActive: true },
    });
    expect(updateJob.mock.calls[1]?.[0]).toEqual({
      where: { id: 'job-11' },
      data: { status: 'CLOSED', isActive: false },
    });
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it('não fecha vaga canônica se outra referência ainda não confirmou fechamento', async () => {
    const updateReference = vi.fn().mockResolvedValue({});
    const updateJob = vi.fn().mockResolvedValue({});
    const db = {
      jobSource: {
        findMany: vi.fn().mockResolvedValue([{ id: 'source-1', slug: 'jobicy', enabled: true }]),
      },
      jobSourceReference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'ref-11', jobId: 'job-11', externalId: '11', job: { status: 'ANALYZED' } },
          ]),
        update: updateReference,
        count: vi.fn().mockResolvedValue(1),
      },
      job: { update: updateJob },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const closedOnly: JobSourceAdapter = {
      ...adapter(),
      checkJobStatuses: vi.fn().mockResolvedValue([{ externalId: '11', status: 'CLOSED' }]),
    };
    const registry = new JobSourceRegistry().register(closedOnly);

    const result = await new JobAvailabilitySyncService(db, registry, logger).run(100);

    expect(result.closed).toBe(1);
    expect(updateReference).toHaveBeenCalledOnce();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it('reativa vaga stale e agenda nova análise quando a fonte confirma active', async () => {
    const updateJob = vi.fn().mockResolvedValue({});
    const db = {
      jobSource: {
        findMany: vi.fn().mockResolvedValue([{ id: 'source-1', slug: 'jobicy', enabled: true }]),
      },
      jobSourceReference: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'ref-10', jobId: 'job-10', externalId: '10', job: { status: 'STALE' } },
          ]),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      job: { update: updateJob },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const activeOnly: JobSourceAdapter = {
      ...adapter(),
      checkJobStatuses: vi.fn().mockResolvedValue([{ externalId: '10', status: 'ACTIVE' }]),
    };
    const registry = new JobSourceRegistry().register(activeOnly);

    await new JobAvailabilitySyncService(db, registry, logger).run(100);

    expect(updateJob).toHaveBeenCalledOnce();
    const call = updateJob.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { isActive: boolean; status?: string };
    };
    expect(call.where.id).toBe('job-10');
    expect(call.data.isActive).toBe(true);
    expect(call.data.status).toBe('PENDING_ANALYSIS');
  });
});
