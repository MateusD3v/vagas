import type { Environment } from '../../config/env.js';
import type { AppLogger } from '../../shared/logger.js';
import { ConsoleNotificationProvider } from './console.provider.js';
import type { NotificationProvider } from './notification.interface.js';
import { WebhookNotificationProvider } from './webhook.provider.js';

export function createNotificationProviders(
  config: Environment,
  logger: AppLogger,
): NotificationProvider[] {
  if (!config.ENABLE_NOTIFICATIONS) return [];
  const providers: NotificationProvider[] = [new ConsoleNotificationProvider(logger)];
  if (config.NOTIFICATION_WEBHOOK_URL) {
    providers.push(
      new WebhookNotificationProvider(
        config.NOTIFICATION_WEBHOOK_URL,
        config.NOTIFICATION_WEBHOOK_TIMEOUT_MS,
        logger,
      ),
    );
  }
  return providers;
}
