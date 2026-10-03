import pino from 'pino';
import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { RetentionService } from './modules/maintenance/retention.service.js';
import { createCollectionService } from './modules/sources/collection.factory.js';
import { CollectionScheduler } from './workers/collection-scheduler.js';

const logger = pino({ level: env.LOG_LEVEL });
const collection = createCollectionService(prisma, env, logger);
const retention = new RetentionService(
  prisma,
  env.COLLECTION_RUN_RETENTION_DAYS,
  env.AUDIT_LOG_RETENTION_DAYS,
  env.JOB_STALE_AFTER_DAYS,
  env.JOB_CLOSED_AFTER_DAYS,
);
let stopping = false;

async function heartbeat(status = 'RUNNING'): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { workerName: 'job-collection-worker' },
    create: {
      workerName: 'job-collection-worker',
      status,
      metadata: { schedulerEnabled: env.ENABLE_SCHEDULER, cron: env.JOB_COLLECTION_CRON },
    },
    update: {
      status,
      lastSeenAt: new Date(),
      metadata: { schedulerEnabled: env.ENABLE_SCHEDULER, cron: env.JOB_COLLECTION_CRON },
    },
  });
}

async function runMaintenance(): Promise<void> {
  const result = await retention.run();
  if (
    result.collectionRunsDeleted ||
    result.auditLogsDeleted ||
    result.jobsClosed ||
    result.jobsStale
  ) {
    logger.info({ retention: result }, 'Manutenção automática concluída');
  }
}

await heartbeat();
void runMaintenance().catch((error: unknown) =>
  logger.error({ err: error }, 'Manutenção de retenção falhou'),
);
const maintenanceTimer = setInterval(
  () => {
    void runMaintenance().catch((error: unknown) =>
      logger.error({ err: error }, 'Manutenção de retenção falhou'),
    );
  },
  24 * 60 * 60 * 1000,
);
const heartbeatTimer = setInterval(() => {
  void heartbeat().catch((error: unknown) => logger.error({ err: error }, 'Heartbeat falhou'));
}, 30_000);

const scheduler = new CollectionScheduler(env.JOB_COLLECTION_CRON, collection, logger);
if (env.ENABLE_SCHEDULER) scheduler.start();

logger.info(
  {
    worker: 'job-collection-worker',
    schedulerEnabled: env.ENABLE_SCHEDULER,
    cron: env.JOB_COLLECTION_CRON,
  },
  'Worker iniciado',
);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Encerrando worker');
  scheduler.stop();
  clearInterval(maintenanceTimer);
  clearInterval(heartbeatTimer);
  await heartbeat('STOPPED').catch(() => undefined);
  await prisma.$disconnect();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => {
      process.exitCode = 0;
    });
  });
}
