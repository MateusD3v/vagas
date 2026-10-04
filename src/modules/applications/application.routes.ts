import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/client.js';
import { SubmissionProviderRegistry } from '../../integrations/submission/submission.registry.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { AppError, idParamsSchema, paginationMeta, paginationSchema } from '../../shared/http.js';
import { CandidateAnswerService } from '../profile/candidate-answer.service.js';
import {
  classifyApplicationChannel,
  readApplicationQuestions,
  readFastApplyHint,
} from './application-channel.js';
import { ApplicationEligibilityService } from './application-eligibility.service.js';
import { evaluateApplicationQuestionReadiness } from './application-question-readiness.js';
import { ApplicationPreparationService } from './application-preparation.service.js';
import { ApplicationService } from './application.service.js';
import { ApplicationSubmissionService } from './application-submission.service.js';

const applicationQuestionAnswerSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1).max(5000),
  allowedForAutomaticUse: z.boolean().default(true),
});

const followUpSchema = z.object({
  nextFollowUpAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  completed: z.boolean().default(false),
});

const statusUpdateSchema = z.object({
  status: z.enum([
    'READY',
    'SUBMITTED',
    'FAILED',
    'REJECTED',
    'INTERVIEW',
    'OFFER',
    'ACCEPTED',
    'WITHDRAWN',
  ]),
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
      'ACCEPTED',
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
  const candidateAnswers = new CandidateAnswerService(prisma);
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
      return {
        data: items.map((item) => ({
          ...item,
          applicationChannel: classifyApplicationChannel(
            item.job.applicationUrl,
            item.job.source,
            readFastApplyHint(item.job.rawData),
          ),
        })),
        meta: paginationMeta(total, query.page, query.pageSize),
      };
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
    '/applications/:id/fast-apply-kit',
    {
      schema: {
        tags: ['Applications'],
        summary: 'Monta o kit local para candidatura rápida/manual',
      },
    },
    async (request) => {
      const applicationId = idParamsSchema.parse(request.params).id;
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          job: true,
          candidate: {
            select: {
              fullName: true,
              email: true,
              phone: true,
              city: true,
              state: true,
              linkedinUrl: true,
              githubUrl: true,
              portfolioUrl: true,
              answers: true,
            },
          },
        },
      });
      if (!application) throw new AppError('Candidatura não encontrada', 404);
      const prepared = await preparation.get(applicationId);
      const resumeMarkdown = await preparation.getResumeMarkdown(applicationId);
      const applicationQuestions = readApplicationQuestions(application.job.rawData);
      const questionReadiness = evaluateApplicationQuestionReadiness(
        applicationQuestions,
        application.candidate,
        application.candidate.answers,
      );
      const requiredQuestionsPending = questionReadiness.filter(
        (question) => question.required && question.source === 'MANUAL',
      ).length;
      return {
        applicationId,
        applicationUrl: application.job.applicationUrl,
        channel: classifyApplicationChannel(
          application.job.applicationUrl,
          application.job.source,
          readFastApplyHint(application.job.rawData),
        ),
        resumeMarkdown,
        reusableAnswers: prepared.reusableAnswers,
        applicationQuestions,
        questionReadiness,
        requiredQuestionsPending,
        readyForAssistedApply: requiredQuestionsPending === 0,
        missingInformation: prepared.missingInformation,
      };
    },
  );

  app.post(
    '/applications/:id/questions/answers',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Applications'],
        summary: 'Salva resposta confirmada para uma pergunta conhecida desta candidatura',
        security: [{ adminKey: [] }],
      },
    },
    async (request) => {
      const applicationId = idParamsSchema.parse(request.params).id;
      const input = applicationQuestionAnswerSchema.parse(request.body);
      const answer = await candidateAnswers.upsertForApplication(applicationId, input);
      await preparation.prepare(applicationId);
      return answer;
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

  app.patch(
    '/applications/:id/follow-up',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Applications'],
        summary: 'Agenda ou conclui um acompanhamento da candidatura',
        security: [{ adminKey: [] }],
      },
    },
    async (request) => {
      const applicationId = idParamsSchema.parse(request.params).id;
      const input = followUpSchema.parse(request.body);
      const application = await prisma.application.findUnique({ where: { id: applicationId } });
      if (!application) throw new AppError('Candidatura não encontrada', 404);
      const now = new Date();
      const updated = await prisma.application.update({
        where: { id: applicationId },
        data: {
          ...(input.nextFollowUpAt !== undefined
            ? { nextFollowUpAt: input.nextFollowUpAt, followUpNotifiedAt: null }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.completed
            ? { lastFollowUpAt: now, nextFollowUpAt: null, followUpNotifiedAt: null }
            : {}),
        },
      });
      await prisma.auditLog.create({
        data: {
          event: input.completed
            ? 'APPLICATION_FOLLOW_UP_COMPLETED'
            : 'APPLICATION_FOLLOW_UP_SCHEDULED',
          entityType: 'Application',
          entityId: applicationId,
          metadata: {
            nextFollowUpAt: updated.nextFollowUpAt?.toISOString() ?? null,
            lastFollowUpAt: updated.lastFollowUpAt?.toISOString() ?? null,
          },
        },
      });
      return updated;
    },
  );

  app.get(
    '/applications/follow-ups/due',
    { schema: { tags: ['Applications'], summary: 'Lista acompanhamentos vencidos ou para agora' } },
    async () => ({
      data: await prisma.application.findMany({
        where: {
          nextFollowUpAt: { lte: new Date() },
          status: { in: ['SUBMITTED', 'INTERVIEW', 'OFFER'] },
        },
        include: { job: true },
        orderBy: { nextFollowUpAt: 'asc' },
      }),
    }),
  );

  app.get(
    '/applications/:id/timeline',
    { schema: { tags: ['Applications'], summary: 'Lista o histórico de estágios da candidatura' } },
    async (request) => {
      const applicationId = idParamsSchema.parse(request.params).id;
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true },
      });
      if (!application) throw new AppError('Candidatura não encontrada', 404);
      return {
        data: await prisma.applicationEvent.findMany({
          where: { applicationId },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        }),
      };
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
