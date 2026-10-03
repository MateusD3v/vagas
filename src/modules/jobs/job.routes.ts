import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { prisma } from '../../database/client.js';
import { MockJobSource } from '../../integrations/job-sources/mock/mock.adapter.js';
import { createLLMProvider } from '../../integrations/llm/provider.factory.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { idParamsSchema } from '../../shared/http.js';
import { AnalyzeJobWorker } from '../../workers/analyze-job.worker.js';
import { CollectJobsWorker } from '../../workers/collect-jobs.worker.js';
import { JobMatchingService } from '../matching/job-matching.service.js';
import { JobIngestionService } from './job-ingestion.service.js';
import { JobReprocessService } from './job-reprocess.service.js';
import { jobsQuerySchema, manualJobImportSchema } from './job.schemas.js';
import { ManualJobIntakeService } from './manual-job-intake.service.js';
import { JobService } from './job.service.js';

export function jobRoutes(app: FastifyInstance): void {
  const jobs = new JobService(prisma);
  const matching = new JobMatchingService(
    prisma,
    createLLMProvider(env),
    env.AI_ADJUSTMENT_LIMIT,
    env.MATCHING_ENGINE_VERSION,
  );
  const analyzer = new AnalyzeJobWorker(matching, app.log);
  const ingestion = new JobIngestionService(prisma);
  const reprocessor = new JobReprocessService(prisma, matching, env);
  const collector = new CollectJobsWorker(ingestion, analyzer, app.log);
  const manualIntake = new ManualJobIntakeService(ingestion, matching);

  app.get('/jobs', { schema: { tags: ['Jobs'], summary: 'Lista e filtra vagas' } }, (request) =>
    jobs.list(jobsQuerySchema.parse(request.query)),
  );

  app.get('/jobs/:id', { schema: { tags: ['Jobs'], summary: 'Detalha uma vaga' } }, (request) =>
    jobs.get(idParamsSchema.parse(request.params).id),
  );

  app.post(
    '/jobs/import/mock',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Jobs'],
        summary: 'Importa e analisa as 15 vagas fictícias',
        security: [{ adminKey: [] }],
      },
    },
    async (_request, reply) => {
      const result = await collector.run(new MockJobSource());
      return reply.code(201).send(result);
    },
  );

  app.post(
    '/jobs/import/manual',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Jobs'],
        summary: 'Importa uma vaga informada manualmente e executa o matching',
        security: [{ adminKey: [] }],
      },
    },
    async (request, reply) => {
      const result = await manualIntake.importAndAnalyze(manualJobImportSchema.parse(request.body));
      return reply.code(result.inserted ? 201 : 200).send(result);
    },
  );

  app.post(
    '/jobs/reprocess',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Matching'],
        summary: 'Reavalia vagas ativas após mudança do perfil ou preferências',
        security: [{ adminKey: [] }],
      },
    },
    () => reprocessor.run(),
  );

  app.post(
    '/jobs/:id/analyze',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Matching'],
        summary: 'Analisa ou reanalisa uma vaga',
        security: [{ adminKey: [] }],
      },
    },
    (request) => analyzer.run(idParamsSchema.parse(request.params).id),
  );
}
