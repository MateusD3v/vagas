import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { prisma } from '../../database/client.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { WorkerCycleService } from '../../workers/worker-cycle.service.js';

export function workerCycleRoutes(app: FastifyInstance): void {
  const cycle = new WorkerCycleService(prisma, env, app.log);
  const processStartedAt = new Date(Date.now() - Math.floor(process.uptime() * 1000));

  app.post(
    '/worker/run-once',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Worker'],
        summary: 'Agenda um ciclo único protegido de coleta e manutenção',
        security: [{ adminKey: [] }],
      },
    },
    async (_request, reply) => {
      await cycle.recoverInterruptedCycle(processStartedAt);
      const run = cycle.run('api');
      const outcome = await Promise.race([
        run.then((result) => ({ started: result.started })),
        new Promise<{ started: true }>((resolve) =>
          setTimeout(() => resolve({ started: true }), 250),
        ),
      ]);

      if (!outcome.started) {
        return reply.code(409).send({ scheduled: false, reason: 'WORKER_ALREADY_RUNNING' });
      }

      void run.catch((error: unknown) => {
        app.log.error({ err: error }, 'Ciclo agendado pela API falhou');
      });
      return reply.code(202).send({ scheduled: true });
    },
  );

  app.get(
    '/worker/status',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Worker'],
        summary: 'Retorna o último heartbeat do worker',
        security: [{ adminKey: [] }],
      },
    },
    () =>
      prisma.workerHeartbeat.findUnique({
        where: { workerName: 'job-collection-worker' },
      }),
  );
}
