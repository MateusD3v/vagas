import type { PrismaClient } from '@prisma/client';

export class AnalysisBudgetService {
  constructor(private readonly db: PrismaClient) {}

  async reserveDaily(limit: number, now = new Date()): Promise<boolean> {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await this.db.dailyAnalysisBudget.upsert({
      where: { date },
      create: { date, used: 0 },
      update: {},
    });
    const reserved = await this.db.dailyAnalysisBudget.updateMany({
      where: { date, used: { lt: limit } },
      data: { used: { increment: 1 } },
    });
    return reserved.count === 1;
  }

  async releaseDaily(now = new Date()): Promise<void> {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await this.db.dailyAnalysisBudget.updateMany({
      where: { date, used: { gt: 0 } },
      data: { used: { decrement: 1 } },
    });
  }
}
