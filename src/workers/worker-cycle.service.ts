import type { PrismaClient } from '@prisma/client';
import type { Environment } from '../config/env.js';
import { createJobSourceRegistry } from '../integrations/job-sources/registry.factory.js';
import { ApplicationPreparationService } from '../modules/applications/application-preparation.service.js';
import { JobAvailabilitySyncService } from '../modules/maintenance/job-availability-sync.service.js';
import { RetentionService } from '../modules/maintenance/retention.service.js';
import { createCollectionService } from '../modules/sources/collection.factory.js';
import type { AppLogger } from '../shared/logger.js';

export interface WorkerCycleResult {
  started: boolean;
  collectionRuns: number;
  resumed: number;
  availability: Awaited<ReturnType<JobAvailabilitySyncService['run']>> | null;
  preparation: Awaited<ReturnType<ApplicationPreparationService['preparePending']>> | null;
  maintenance: Awaited<ReturnType<RetentionService['run']>> | null;
}

export interface WorkerCycleDependencies {
  collection: Pick<ReturnType<typeof createCollectionService>, 'runEnabled' | 'resumePending'>;
  availabilitySync: Pick<JobAvailabilitySyncService, 'run'>;
  applicationPreparation: Pick<ApplicationPreparationService, 'preparePending'>;
  retention: Pick<RetentionService, 'run'>;
}

export class WorkerCycleService {
  private readonly collection: WorkerCycleDependencies['collection'];
  private readonly availabilitySync: WorkerCycleDependencies['availabilitySync'];
  private readonly applicationPreparation: WorkerCycleDependencies['applicationPreparation'];
  private readonly retention: WorkerCycleDependencies['retention'];

  constructor(
    private readonly db: PrismaClient,
    private readonly config: Environment,
    private readonly logger: AppLogger,
    dependencies?: WorkerCycleDependencies,
  ) {
    if (dependencies) {
      this.collection = dependencies.collection;
      this.availabilitySync = dependencies.availabilitySync;
      this.applicationPreparation = dependencies.applicationPreparation;
      this.retention = dependencies.retention;
      return;
    }

    const registry = createJobSourceRegistry(config);
    this.collection = createCollectionService(db, config, logger, registry);
    this.availabilitySync = new JobAvailabilitySyncService(db, registry, logger);
    this.applicationPreparation = new ApplicationPreparationService(db);
    this.retention = new RetentionService(
      db,
      config.COLLECTION_RUN_RETENTION_DAYS,
      config.AUDIT_LOG_RETENTION_DAYS,
      config.JOB_STALE_AFTER_DAYS,
      config.JOB_CLOSED_AFTER_DAYS,
    );
  }

  private async claim(trigger: string): Promise<boolean> {
    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - this.config.WORKER_CYCLE_LOCK_TTL_MINUTES * 60_000,
    );

    await this.db.workerHeartbeat.upsert({
      where: { workerName: 'job-collection-worker' },
      create: {
        workerName: 'job-collection-worker',
        status: 'IDLE',
        metadata: { mode: 'cron', trigger },
      },
      update: {},
    });

    const claimed = await this.db.workerHeartbeat.updateMany({
      where: {
        workerName: 'job-collection-worker',
        OR: [{ status: { not: 'RUNNING' } }, { lastSeenAt: { lt: staleBefore } }],
      },
      data: {
        status: 'RUNNING',
        lastSeenAt: now,
        metadata: { mode: 'cron', trigger },
      },
    });
    return claimed.count === 1;
  }

  private async heartbeat(
    status: 'IDLE' | 'FAILED',
    trigger: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.workerHeartbeat.update({
      where: { workerName: 'job-collection-worker' },
      data: {
        status,
        lastSeenAt: new Date(),
        metadata: { mode: 'cron', trigger, ...metadata },
      },
    });
  }

  async run(trigger = 'manual'): Promise<WorkerCycleResult> {
    const claimed = await this.claim(trigger);
    if (!claimed) {
      return {
        started: false,
        collectionRuns: 0,
        resumed: 0,
        availability: null,
        preparation: null,
        maintenance: null,
      };
    }

    try {
      const collectionRuns = this.config.ENABLE_SCHEDULER ? await this.collection.runEnabled() : [];
      const resumed = await this.collection.resumePending();
      const availability = await this.availabilitySync.run(this.config.JOB_STATUS_SYNC_BATCH_SIZE);
      const preparation = this.config.AUTO_PREPARE_APPLICATIONS
        ? await this.applicationPreparation.preparePending(
            this.config.APPLICATION_PREPARATION_BATCH_SIZE,
          )
        : null;
      const maintenance = await this.retention.run();

      await this.heartbeat('IDLE', trigger, {
        collectionRuns: collectionRuns.length,
        resumed,
        availability,
        preparation,
        maintenance,
      });

      const result = {
        started: true,
        collectionRuns: collectionRuns.length,
        resumed,
        availability,
        preparation,
        maintenance,
      };
      this.logger.info({ trigger, workerCycle: result }, 'Ciclo agendado concluído');
      return result;
    } catch (error) {
      await this.heartbeat('FAILED', trigger, {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }).catch(() => undefined);
      throw error;
    }
  }
}
