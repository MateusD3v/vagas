import type { AppLogger } from '../../shared/logger.js';
import type { NotificationMatch, NotificationProvider } from './notification.interface.js';

export class ConsoleNotificationProvider implements NotificationProvider {
  constructor(private readonly logger: AppLogger) {}

  notifyNewApply(jobMatch: NotificationMatch): Promise<void> {
    this.logger.info(
      { event: 'HIGH_MATCH_FOUND', jobId: jobMatch.jobId, score: jobMatch.score },
      'Vaga com decisão APPLY encontrada',
    );
    return Promise.resolve();
  }

  notifyReview(jobMatch: NotificationMatch): Promise<void> {
    this.logger.info(
      { event: 'REVIEW_REQUIRED', jobId: jobMatch.jobId, score: jobMatch.score },
      'Vaga requer revisão',
    );
    return Promise.resolve();
  }

  notifySourceFailure(source: string, message: string): Promise<void> {
    this.logger.warn({ event: 'SOURCE_FAILED', source, error: message }, 'Fonte falhou');
    return Promise.resolve();
  }
}
