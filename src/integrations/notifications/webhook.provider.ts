import type { AppLogger } from '../../shared/logger.js';
import type { NotificationMatch, NotificationProvider } from './notification.interface.js';

interface WebhookPayload {
  event: 'HIGH_MATCH_FOUND' | 'REVIEW_REQUIRED' | 'SOURCE_FAILED';
  createdAt: string;
  data: Record<string, unknown>;
}

export class WebhookNotificationProvider implements NotificationProvider {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
    private readonly logger: AppLogger,
  ) {}

  notifyNewApply(jobMatch: NotificationMatch): Promise<void> {
    return this.send({
      event: 'HIGH_MATCH_FOUND',
      createdAt: new Date().toISOString(),
      data: { jobId: jobMatch.jobId, score: jobMatch.score, decision: jobMatch.decision },
    });
  }

  notifyReview(jobMatch: NotificationMatch): Promise<void> {
    return this.send({
      event: 'REVIEW_REQUIRED',
      createdAt: new Date().toISOString(),
      data: { jobId: jobMatch.jobId, score: jobMatch.score, decision: jobMatch.decision },
    });
  }
  notifySourceFailure(source: string, message: string): Promise<void> {
    return this.send({
      event: 'SOURCE_FAILED',
      createdAt: new Date().toISOString(),
      data: { source, message },
    });
  }

  private async send(payload: WebhookPayload): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Webhook respondeu HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.warn({ err: error, event: payload.event }, 'Falha ao enviar notificação webhook');
    } finally {
      clearTimeout(timer);
    }
  }
}
