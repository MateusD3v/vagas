import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { prisma } from '../../database/client.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { AppError, idParamsSchema, paginationMeta } from '../../shared/http.js';
import { createCollectionService } from './collection.factory.js';
import { buildPortalSearchPlan } from './portal-search-plan.js';
import { fetchSejaTraineeArticles, type SejaTraineeArticle } from './seja-trainee-feed.js';
import {
  collectionRunsQuerySchema,
  searchProfileUpdateSchema,
  sourcesQuerySchema,
} from './source.schemas.js';

export function sourceRoutes(app: FastifyInstance): void {
  const collection = createCollectionService(prisma, env, app.log);
  let traineeCache: { expiresAt: number; articles: SejaTraineeArticle[] } | null = null;
  const adminOptions = {
    preHandler: requireAdmin,
    config: { rateLimit: adminRateLimit },
  };

  app.get(
    '/job-sources',
    { schema: { tags: ['Sources'], summary: 'Lista fontes registradas' } },
    async (request) => {
      const query = sourcesQuerySchema.parse(request.query);
      const where: Prisma.JobSourceWhereInput = {
        ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
        ...(query.type ? { type: query.type } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.jobSource.findMany({
          where,
          orderBy: { slug: 'asc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.jobSource.count({ where }),
      ]);
      return { data: items, meta: paginationMeta(total, query.page, query.pageSize) };
    },
  );

  app.get(
    '/job-sources/:id',
    { schema: { tags: ['Sources'], summary: 'Detalha uma fonte' } },
    async (request) => {
      const source = await prisma.jobSource.findUnique({
        where: { id: idParamsSchema.parse(request.params).id },
        include: { collectionRuns: { orderBy: { startedAt: 'desc' }, take: 10 } },
      });
      if (!source) throw new AppError('Fonte não encontrada', 404);
      return source;
    },
  );

  app.post(
    '/job-sources/run',
    {
      ...adminOptions,
      schema: {
        tags: ['Sources'],
        summary: 'Agenda coleta em todas as fontes habilitadas',
        security: [{ adminKey: [] }],
      },
    },
    async (_request, reply) =>
      reply.code(202).send({ collectionRunIds: await collection.schedule() }),
  );

  app.post(
    '/job-sources/:id/run',
    {
      ...adminOptions,
      schema: {
        tags: ['Sources'],
        summary: 'Agenda coleta em uma fonte',
        security: [{ adminKey: [] }],
      },
    },
    async (request, reply) => {
      const id = idParamsSchema.parse(request.params).id;
      return reply.code(202).send({ collectionRunIds: await collection.schedule(id) });
    },
  );

  app.get(
    '/collection-runs',
    { schema: { tags: ['Sources'], summary: 'Lista execuções de coleta' } },
    async (request) => {
      const query = collectionRunsQuerySchema.parse(request.query);
      const where: Prisma.CollectionRunWhereInput = {
        ...(query.source ? { source: { slug: query.source } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              startedAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        prisma.collectionRun.findMany({
          where,
          include: { source: { select: { id: true, name: true, slug: true } } },
          orderBy: { startedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.collectionRun.count({ where }),
      ]);
      return { data: items, meta: paginationMeta(total, query.page, query.pageSize) };
    },
  );

  app.get(
    '/collection-runs/:id',
    { schema: { tags: ['Sources'], summary: 'Detalha uma execução e seus erros' } },
    async (request) => {
      const run = await prisma.collectionRun.findUnique({
        where: { id: idParamsSchema.parse(request.params).id },
        include: { source: true, errors: true },
      });
      if (!run) throw new AppError('Execução não encontrada', 404);
      return run;
    },
  );

  app.get(
    '/portal-search-plan',
    {
      ...adminOptions,
      schema: {
        tags: ['Sources'],
        summary: 'Gera buscas assistidas para portais sem API pública configurada',
        security: [{ adminKey: [] }],
      },
    },
    async () => {
      const profile = await prisma.jobSearchProfile.findFirst();
      if (!profile) throw new AppError('Perfil de busca não configurado', 404);
      return buildPortalSearchPlan({
        keywords: profile.keywords,
        locations: profile.locations,
      });
    },
  );

  app.get(
    '/seja-trainee/articles',
    {
      ...adminOptions,
      schema: {
        tags: ['Sources'],
        summary: 'Lista matérias recentes do RSS público do Seja Trainee (não confirma vagas)',
        security: [{ adminKey: [] }],
      },
    },
    async () => {
      if (!traineeCache || traineeCache.expiresAt < Date.now()) {
        let articles: SejaTraineeArticle[];
        try {
          articles = await fetchSejaTraineeArticles();
        } catch {
          throw new AppError('Não foi possível consultar o RSS público do Seja Trainee', 502);
        }
        traineeCache = { articles, expiresAt: Date.now() + 15 * 60_000 };
      }
      return {
        source: 'https://sejatrainee.com.br/feed/',
        kind: 'EDITORIAL_DISCOVERY',
        warning: 'Matérias não são inscrições nem prova de vaga aberta; valide o anúncio oficial.',
        articles: traineeCache.articles,
      };
    },
  );

  app.get(
    '/job-search-profile',
    {
      ...adminOptions,
      schema: {
        tags: ['Sources'],
        summary: 'Retorna configuração de busca',
        security: [{ adminKey: [] }],
      },
    },
    async () => {
      const profile = await prisma.jobSearchProfile.findFirst();
      if (!profile) throw new AppError('Perfil de busca não configurado', 404);
      return profile;
    },
  );

  app.put(
    '/job-search-profile',
    {
      ...adminOptions,
      schema: {
        tags: ['Sources'],
        summary: 'Atualiza a configuração de busca',
        security: [{ adminKey: [] }],
      },
    },
    async (request) => {
      const candidate = await prisma.candidateProfile.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!candidate) throw new AppError('Perfil não cadastrado', 409);
      const input = searchProfileUpdateSchema.parse(request.body);
      return prisma.jobSearchProfile.upsert({
        where: { candidateId: candidate.id },
        create: { ...input, candidateId: candidate.id },
        update: input,
      });
    },
  );
}
