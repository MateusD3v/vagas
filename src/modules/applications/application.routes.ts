import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../database/client.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { AppError, idParamsSchema, paginationMeta, paginationSchema } from '../../shared/http.js';
import { ApplicationPreparationService } from './application-preparation.service.js';
import { ApplicationService } from './application.service.js';

const statusUpdateSchema = z.object({
  status: z.enum(['READY', 'SUBMITTED', 'FAILED', 'REJECTED', 'INTERVIEW', 'OFFER', 'WITHDRAWN']),
  externalApplicationId: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

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
  const preparation = new ApplicationPreparationService(prisma);
  const applications = new ApplicationService(prisma);

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
    '/applications/:id/preparation',
    {
      schema: { tags: ['Applications'], summary: 'Obtém o pacote preparado da candidatura' },
    },
    (request) => preparation.get(idParamsSchema.parse(request.params).id),
  );

  app.post(
    '/applications/:id/prepare',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Applications'],
        summary: 'Gera ou atualiza o pacote local para candidatura',
        security: [{ adminKey: [] }],
      },
    },
    (request) => preparation.prepare(idParamsSchema.parse(request.params).id),
  );

  app.patch(
    '/applications/:id/status',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Applications'],
        summary: 'Atualiza manualmente o estágio da candidatura',
        security: [{ adminKey: [] }],
      },
    },
    (request) =>
      applications.updateStatus(
        idParamsSchema.parse(request.params).id,
        statusUpdateSchema.parse(request.body),
      ),
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
