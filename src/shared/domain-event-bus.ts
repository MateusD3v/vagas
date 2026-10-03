import type { JobMatch } from '@prisma/client';
import type { NotificationProvider } from '../integrations/notifications/notification.interface.js';

export type DomainEvent =
  | { type: 'HIGH_MATCH_FOUND'; match: JobMatch }
  | { type: 'REVIEW_REQUIRED'; match: JobMatch }
  | { type: 'SOURCE_FAILED'; source: string; message: string };

export class DomainEventBus {
  constructor(private readonly notifications: NotificationProvider[] = []) {}

  async publish(event: DomainEvent): Promise<void> {
    for (const provider of this.notifications) {
      if (event.type === 'HIGH_MATCH_FOUND') await provider.notifyNewApply(event.match);
      if (event.type === 'REVIEW_REQUIRED') await provider.notifyReview(event.match);
      if (event.type === 'SOURCE_FAILED') {
        await provider.notifySourceFailure(event.source, event.message);
      }
    }
  }
}
