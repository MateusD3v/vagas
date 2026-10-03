import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { applicationRoutes } from './modules/applications/application.routes.js';
import { auditRoutes } from './modules/audit/audit.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { jobRoutes } from './modules/jobs/job.routes.js';
import { matchRoutes } from './modules/matching/match.routes.js';
import { candidateAnswerRoutes } from './modules/profile/candidate-answer.routes.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import { statsRoutes } from './modules/stats/stats.routes.js';
import { sourceRoutes } from './modules/sources/source.routes.js';
import { requireAdmin } from './shared/admin-security.js';
import { AppError } from './shared/http.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  await app.register(cors, { origin: false });
  await app.register(sensible);
  await app.register(rateLimit, { global: false });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Job Application Agent API',
        description: 'Coleta, matching auditável e preparação local de candidaturas.',
        version: '0.3.0',
      },
      tags: [
        { name: 'System' },
        { name: 'Profile' },
        { name: 'Jobs' },
        { name: 'Matching' },
        { name: 'Applications' },
        { name: 'Audit' },
        { name: 'Stats' },
        { name: 'Sources' },
      ],
      components: {
        securitySchemes: {
          adminKey: { type: 'apiKey', in: 'header', name: 'X-Admin-Key' },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    const publicPath =
      path === '/health' ||
      path === '/dashboard' ||
      path.startsWith('/docs') ||
      path.startsWith('/documentation');
    if (!publicPath) await requireAdmin(request, reply);
  });

  app.get(
    '/health',
    { schema: { tags: ['System'], summary: 'Verifica API e banco de dados' } },
    async () => {
      const [, worker, profile] = await Promise.all([
        prisma.$queryRaw`SELECT 1`,
        prisma.workerHeartbeat.findUnique({ where: { workerName: 'job-collection-worker' } }),
        prisma.candidateProfile.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { isDemo: true },
        }),
      ]);
      const workerStatusAllowed =
        worker?.status === 'RUNNING' || (env.WORKER_MODE === 'cron' && worker?.status === 'IDLE');
      const workerAlive = Boolean(
        worker &&
        Date.now() - worker.lastSeenAt.getTime() < env.WORKER_HEALTH_TTL_SECONDS * 1000 &&
        workerStatusAllowed,
      );
      return {
        status: 'ok',
        database: 'connected',
        worker: {
          status: workerAlive ? 'healthy' : 'unavailable',
          mode: env.WORKER_MODE,
          lastSeenAt: worker?.lastSeenAt ?? null,
        },
        profile: {
          status: !profile ? 'missing' : profile.isDemo ? 'demo' : 'ready',
          collectionReady: Boolean(profile && !profile.isDemo),
        },
        timestamp: new Date().toISOString(),
      };
    },
  );

  await app.register(profileRoutes);
  await app.register(candidateAnswerRoutes);
  await app.register(jobRoutes);
  await app.register(matchRoutes);
  await app.register(applicationRoutes);
  await app.register(auditRoutes);
  await app.register(statsRoutes);
  await app.register(dashboardRoutes);
  await app.register(sourceRoutes);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'ValidationError',
        message: 'Dados inválidos',
        details: error.flatten(),
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.name,
        message: error.message,
        details: error.details,
      });
    }
    request.log.error({ err: error }, 'Erro não tratado');
    return reply.code(500).send({ error: 'InternalServerError', message: 'Erro interno' });
  });

  app.addHook('onClose', async () => prisma.$disconnect());
  return app;
}
