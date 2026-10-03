import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RetentionService } from '../src/modules/maintenance/retention.service.js';

describe('retenção operacional', () => {
  it('remove dados antigos e classifica vagas não vistas como stale/closed', async () => {
    const deleteRuns = vi.fn().mockResolvedValue({ count: 2 });
    const deleteAudits = vi.fn().mockResolvedValue({ count: 3 });
    const updateJobs = vi
      .fn()
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 5 });
    const db = {
      collectionRun: { deleteMany: deleteRuns },
      auditLog: { deleteMany: deleteAudits },
      job: { updateMany: updateJobs },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as unknown as PrismaClient;
    const service = new RetentionService(db, 30, 90, 14, 30);
    const now = new Date('2026-10-03T12:00:00.000Z');

    await expect(service.run(now)).resolves.toEqual({
      collectionRunsDeleted: 2,
      auditLogsDeleted: 3,
      jobsClosed: 4,
      jobsStale: 5,
    });
    expect(deleteRuns).toHaveBeenCalledWith({
      where: { finishedAt: { lt: new Date('2026-09-03T12:00:00.000Z') } },
    });
    expect(deleteAudits).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-07-05T12:00:00.000Z') } },
    });
    expect(updateJobs).toHaveBeenNthCalledWith(1, {
      where: {
        source: { not: 'mock' },
        isActive: true,
        lastSeenAt: { lt: new Date('2026-09-03T12:00:00.000Z') },
        status: { notIn: ['CLOSED', 'ARCHIVED'] },
      },
      data: { status: 'CLOSED', isActive: false },
    });
    expect(updateJobs).toHaveBeenNthCalledWith(2, {
      where: {
        source: { not: 'mock' },
        isActive: true,
        lastSeenAt: {
          gte: new Date('2026-09-03T12:00:00.000Z'),
          lt: new Date('2026-09-19T12:00:00.000Z'),
        },
        status: { notIn: ['STALE', 'CLOSED', 'ARCHIVED'] },
      },
      data: { status: 'STALE' },
    });
  });
});
