import type { PrismaClient } from '@prisma/client';

export interface FollowUpScanResult {
  due: number;
  applicationIds: string[];
}

export class ApplicationFollowUpService {
  constructor(private readonly db: PrismaClient) {}

  async scanDue(now = new Date(), limit = 50): Promise<FollowUpScanResult> {
    const applications = await this.db.application.findMany({
      where: {
        nextFollowUpAt: { lte: now },
        status: { in: ['SUBMITTED', 'INTERVIEW', 'OFFER'] },
      },
      select: { id: true },
      orderBy: { nextFollowUpAt: 'asc' },
      take: limit,
    });
    return { due: applications.length, applicationIds: applications.map((item) => item.id) };
  }
}
