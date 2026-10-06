import pino from 'pino';
import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { createJobSourceRegistry } from './integrations/job-sources/registry.factory.js';
import { createSubmissionProviders } from './integrations/submission/submission.factory.js';
import { ApplicationSubmissionService } from './modules/applications/application-submission.service.js';
import { ApplicationPreparationService } from './modules/applications/application-preparation.service.js';
import { JobAvailabilitySyncService } from './modules/maintenance/job-availability-sync.service.js';
import { RetentionService } from './modules/maintenance/retention.service.js';
import { createCollectionService } from './modules/sources/collection.factory.js';
import { CollectionScheduler } from './workers/collection-scheduler.js';

const logger = pino({ level: env.LOG_LEVEL });
const sourceRegistry = createJobSourceRegistry(env);
const collection = createCollectionService(prisma, env, logger, sourceRegistry);
const availabilitySync = new JobAvailabilitySyncService(prisma, sourceRegistry, logger);
const applicationPreparation = new ApplicationPreparationService(prisma);
const applicationSubmission = new ApplicationSubmissionService(
  prisma,
  env.SAFE_MODE,
  createSubmissionProviders(prisma, env),
);
let applicationCycleRunning = false;
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

async function runApplicationPreparation(): Promise<void> {
  if (applicationCycleRunning || stopping) return;
  applicationCycleRunning = true;
  try {
    if (env.AUTO_PREPARE_APPLICATIONS) {
      const result = await applicationPreparation.preparePending(
        env.APPLICATION_PREPARATION_BATCH_SIZE,
      );
      if (result.attempted || result.failed)
        logger.info({ applicationPreparation: result }, 'Preparação automática concluída');
    }
    if (env.AUTO_SUBMIT_APPLICATIONS && !env.SAFE_MODE) {
      const submissions = await applicationSubmission.submitPending(
        env.APPLICATION_PREPARATION_BATCH_SIZE,
      );
      if (submissions.attempted)
        logger.info({ submissions }, 'Envio automático por canal autorizado concluído');
    }
  } finally {
    applicationCycleRunning = false;
  }
}

async function runAvailabilitySync(): Promise<void> {
  const result = await availabilitySync.run(env.JOB_STATUS_SYNC_BATCH_SIZE);
  if (result.jobsChecked || result.failures) {
    logger.info({ availabilitySync: result }, 'Disponibilidade das vagas sincronizada');
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

let applicationPreparationTimer: ReturnType<typeof setInterval> | null = null;
if (env.AUTO_PREPARE_APPLICATIONS || env.AUTO_SUBMIT_APPLICATIONS) {
  void runApplicationPreparation().catch((error: unknown) =>
    logger.error({ err: error }, 'Preparação automática de candidaturas falhou'),
  );
  applicationPreparationTimer = setInterval(() => {
    void runApplicationPreparation().catch((error: unknown) =>
      logger.error({ err: error }, 'Preparação automática de candidaturas falhou'),
    );
  }, env.APPLICATION_PREPARATION_INTERVAL_SECONDS * 1000);
}

void runAvailabilitySync().catch((error: unknown) =>
  logger.error({ err: error }, 'Sincronização de disponibilidade falhou'),
);
const availabilitySyncTimer = setInterval(() => {
  void runAvailabilitySync().catch((error: unknown) =>
    logger.error({ err: error }, 'Sincronização de disponibilidade falhou'),
  );
}, env.JOB_STATUS_SYNC_INTERVAL_MINUTES * 60_000);

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
  if (applicationPreparationTimer) clearInterval(applicationPreparationTimer);
  clearInterval(availabilitySyncTimer);
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
