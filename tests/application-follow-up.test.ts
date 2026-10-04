import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationFollowUpService } from '../src/modules/applications/application-follow-up.service.js';

describe('ApplicationFollowUpService', () => {
  it('retorna apenas ids de follow-ups vencidos encontrados pela consulta', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    const db = { application: { findMany } } as unknown as PrismaClient;
    const now = new Date('2026-10-04T12:00:00.000Z');

    const result = await new ApplicationFollowUpService(db).scanDue(now, 25);

    expect(result).toEqual({ due: 2, applicationIds: ['a1', 'a2'] });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        nextFollowUpAt: { lte: now },
        status: { in: ['SUBMITTED', 'INTERVIEW', 'OFFER'] },
      },
      select: { id: true },
      orderBy: { nextFollowUpAt: 'asc' },
      take: 25,
    });
  });
});
