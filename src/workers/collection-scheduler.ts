import { Cron } from 'croner';
import type { AppLogger } from '../shared/logger.js';

export interface ScheduledCollection {
  runEnabled(): Promise<unknown>;
  resumePending?(): Promise<unknown>;
}

export class CollectionScheduler {
  private cron: Cron | null = null;

  constructor(
    private readonly expression: string,
    private readonly collection: ScheduledCollection,
    private readonly logger: AppLogger,
  ) {}

  async runOnce(): Promise<void> {
    this.logger.info({ worker: 'collectJobs', cron: this.expression }, 'Coleta periódica iniciada');
    let collectionError: unknown;
    try {
      await this.collection.runEnabled();
    } catch (error) {
      collectionError = error;
    }

    try {
      await this.collection.resumePending?.();
    } catch (resumeError) {
      if (collectionError) {
        throw new AggregateError(
          [collectionError, resumeError],
          'A coleta e a retomada das análises pendentes falharam',
        );
      }
      throw resumeError;
    }

    if (collectionError instanceof Error) throw collectionError;
    if (collectionError) {
      throw new Error('A coleta falhou com um valor de erro inválido', { cause: collectionError });
    }
  }

  start(): Cron {
    this.cron = new Cron(this.expression, { protect: true }, async () => {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error({ err: error, worker: 'collectJobs' }, 'Coleta periódica falhou');
      }
    });
    return this.cron;
  }

  stop(): void {
    this.cron?.stop();
    this.cron = null;
  }
}
