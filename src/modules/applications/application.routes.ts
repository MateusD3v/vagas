import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/client.js';
import { SubmissionProviderRegistry } from '../../integrations/submission/submission.registry.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { AppError, idParamsSchema, paginationMeta, paginationSchema } from '../../shared/http.js';
import { ApplicationEligibilityService } from './application-eligibility.service.js';
import { ApplicationPreparationService } from './application-preparation.service.js';
import { ApplicationService } from './application.service.js';
import { ApplicationSubmissionService } from './application-submission.service.js';

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
  const submissionProviders = new SubmissionProviderRegistry();
  const preparation = new ApplicationPreparationService(prisma);
  const eligibility = new ApplicationEligibilityService(
    prisma,
    env.SAFE_MODE,
    (source, applicationUrl) => Boolean(submissionProviders.find(source, applicationUrl)),
  );
  const applications = new ApplicationService(prisma);
  const submissions = new ApplicationSubmissionService(prisma, env.SAFE_MODE, submissionProviders);

  app.get(
    '/applications',
    { schema: { tags: ['Applications'], summary: 'Lista candidaturas preparadas' } },
    async (request) => {
      const query = applicationQuerySchema.parse(request.query);
      const where = query.status ? { status: query.status } : {};
      const [items, total] = await Promise.all([
        prisma.application.findMany({
          where,
          include: {
            job: true,
            preparation: {
              select: { id: true, version: true, missingInformation: true, updatedAt: true },
            },
          },
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
    '/applications/:id/resume.md',
    {
      schema: { tags: ['Applications'], summary: 'Exporta o currículo preparado em Markdown' },
    },
    async (request, reply) => {
      const markdown = await preparation.getResumeMarkdown(idParamsSchema.parse(request.params).id);
      return reply.type('text/markdown; charset=utf-8').send(markdown);
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

  app.get(
    '/applications/:id/eligibility',
    {
      schema: {
        tags: ['Applications'],
        summary: 'Avalia elegibilidade e bloqueios para automação',
      },
    },
    (request) => eligibility.evaluate(idParamsSchema.parse(request.params).id),
  );

  app.post(
    '/applications/:id/submit',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Applications'],
        summary: 'Submete via provider explicitamente autorizado quando elegível',
        security: [{ adminKey: [] }],
      },
    },
    (request) => submissions.submit(idParamsSchema.parse(request.params).id),
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
