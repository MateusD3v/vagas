import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../database/client.js';
import { AppError, idParamsSchema, paginationMeta, paginationSchema } from '../../shared/http.js';

const matchQuerySchema = paginationSchema.extend({
  decision: z.enum(['APPLY', 'REVIEW', 'SKIP']).optional(),
  minimumScore: z.coerce.number().int().min(0).max(100).optional(),
});

export function matchRoutes(app: FastifyInstance): void {
  app.get(
    '/matches',
    { schema: { tags: ['Matching'], summary: 'Lista análises' } },
    async (request) => {
      const query = matchQuerySchema.parse(request.query);
      const where = {
        ...(query.decision ? { decision: query.decision } : {}),
        ...(query.minimumScore !== undefined ? { score: { gte: query.minimumScore } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.jobMatch.findMany({
          where,
          include: { job: true },
          orderBy: { updatedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.jobMatch.count({ where }),
      ]);
      return { data: items, meta: paginationMeta(total, query.page, query.pageSize) };
    },
  );

  app.get(
    '/matches/:id',
    { schema: { tags: ['Matching'], summary: 'Detalha uma análise' } },
    async (request) => {
      const match = await prisma.jobMatch.findUnique({
        where: { id: idParamsSchema.parse(request.params).id },
        include: { job: true, candidate: { select: { id: true, fullName: true } } },
      });
      if (!match) throw new AppError('Análise não encontrada', 404);
      return match;
    },
  );
}
