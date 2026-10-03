import type { PrismaClient } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export class RetentionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly collectionRunDays: number,
    private readonly auditLogDays: number,
    private readonly staleAfterDays: number,
    private readonly closedAfterDays: number,
  ) {}

  async run(now = new Date()) {
    const collectionCutoff = new Date(now.getTime() - this.collectionRunDays * DAY_MS);
    const auditCutoff = new Date(now.getTime() - this.auditLogDays * DAY_MS);
    const staleCutoff = new Date(now.getTime() - this.staleAfterDays * DAY_MS);
    const closedCutoff = new Date(now.getTime() - this.closedAfterDays * DAY_MS);

    const [runs, audits, closed, stale] = await this.db.$transaction([
      this.db.collectionRun.deleteMany({ where: { finishedAt: { lt: collectionCutoff } } }),
      this.db.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
      this.db.job.updateMany({
        where: {
          source: { not: 'mock' },
          isActive: true,
          lastSeenAt: { lt: closedCutoff },
          status: { notIn: ['CLOSED', 'ARCHIVED'] },
        },
        data: { status: 'CLOSED', isActive: false },
      }),
      this.db.job.updateMany({
        where: {
          source: { not: 'mock' },
          isActive: true,
          lastSeenAt: { gte: closedCutoff, lt: staleCutoff },
          status: { notIn: ['STALE', 'CLOSED', 'ARCHIVED'] },
        },
        data: { status: 'STALE' },
      }),
    ]);

    return {
      collectionRunsDeleted: runs.count,
      auditLogsDeleted: audits.count,
      jobsClosed: closed.count,
      jobsStale: stale.count,
    };
  }
}
