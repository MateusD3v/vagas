import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../database/client.js';
import { AppError, idParamsSchema, paginationMeta, paginationSchema } from '../../shared/http.js';

const applicationQuerySchema = paginationSchema.extend({
  status: z
    .enum([
      'DISCOVERED',
      'ANALYZED',
      'READY',
      'REVIEW_REQUIRED',
      'SUBMITTED',
      'FAILED',
      'REJECTED',
      'INTERVIEW',
      'OFFER',
      'WITHDRAWN',
    ])
    .optional(),
});

export function applicationRoutes(app: FastifyInstance): void {
  app.get(
    '/applications',
    { schema: { tags: ['Applications'], summary: 'Lista candidaturas preparadas' } },
    async (request) => {
      const query = applicationQuerySchema.parse(request.query);
      const where = query.status ? { status: query.status } : {};
      const [items, total] = await Promise.all([
        prisma.application.findMany({
          where,
          include: { job: true },
          orderBy: { updatedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.application.count({ where }),
      ]);
      return { data: items, meta: paginationMeta(total, query.page, query.pageSize) };
    },
  );

  app.get(
    '/applications/:id',
    { schema: { tags: ['Applications'], summary: 'Detalha uma candidatura' } },
    async (request) => {
      const application = await prisma.application.findUnique({
        where: { id: idParamsSchema.parse(request.params).id },
        include: { job: true, candidate: { select: { id: true, fullName: true } } },
      });
      if (!application) throw new AppError('Candidatura não encontrada', 404);
      return application;
    },
  );
}
