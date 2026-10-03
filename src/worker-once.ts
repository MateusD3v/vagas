import pino from 'pino';
import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { createJobSourceRegistry } from './integrations/job-sources/registry.factory.js';
import { ApplicationPreparationService } from './modules/applications/application-preparation.service.js';
import { JobAvailabilitySyncService } from './modules/maintenance/job-availability-sync.service.js';
import { RetentionService } from './modules/maintenance/retention.service.js';
import { createCollectionService } from './modules/sources/collection.factory.js';

const logger = pino({ level: env.LOG_LEVEL });
const sourceRegistry = createJobSourceRegistry(env);
const collection = createCollectionService(prisma, env, logger, sourceRegistry);
const availabilitySync = new JobAvailabilitySyncService(prisma, sourceRegistry, logger);
const applicationPreparation = new ApplicationPreparationService(prisma);
const retention = new RetentionService(
  prisma,
  env.COLLECTION_RUN_RETENTION_DAYS,
  env.AUDIT_LOG_RETENTION_DAYS,
  env.JOB_STALE_AFTER_DAYS,
  env.JOB_CLOSED_AFTER_DAYS,
);

async function heartbeat(status: 'RUNNING' | 'IDLE' | 'FAILED'): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { workerName: 'job-collection-worker' },
    create: {
      workerName: 'job-collection-worker',
      status,
      metadata: { mode: 'cron', cron: env.JOB_COLLECTION_CRON },
    },
    update: {
      status,
      lastSeenAt: new Date(),
      metadata: { mode: 'cron', cron: env.JOB_COLLECTION_CRON },
    },
  });
}

async function main(): Promise<void> {
  await heartbeat('RUNNING');

  const collectionRuns = env.ENABLE_SCHEDULER ? await collection.runEnabled() : [];
  const resumed = await collection.resumePending();
  const availability = await availabilitySync.run(env.JOB_STATUS_SYNC_BATCH_SIZE);
  const preparation = env.AUTO_PREPARE_APPLICATIONS
    ? await applicationPreparation.preparePending(env.APPLICATION_PREPARATION_BATCH_SIZE)
    : { attempted: 0, prepared: 0, failed: 0 };
  const maintenance = await retention.run();

  await heartbeat('IDLE');
  logger.info(
    {
      mode: 'cron',
      collectionRuns: collectionRuns.length,
      resumed,
      availability,
      preparation,
      maintenance,
    },
    'Ciclo único do worker concluído',
  );
}

main()
  .catch(async (error: unknown) => {
    logger.error({ err: error }, 'Ciclo único do worker falhou');
    await heartbeat('FAILED').catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
