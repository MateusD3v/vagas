import type { PrismaClient } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import { createJobSourceRegistry } from '../../integrations/job-sources/registry.factory.js';
import { createLLMProvider } from '../../integrations/llm/provider.factory.js';
import { ConsoleNotificationProvider } from '../../integrations/notifications/console.provider.js';
import { DomainEventBus } from '../../shared/domain-event-bus.js';
import type { AppLogger } from '../../shared/logger.js';
import { JobMatchingService } from '../matching/job-matching.service.js';
import { JobCollectionService } from './job-collection.service.js';

export function createCollectionService(
  db: PrismaClient,
  config: Environment,
  logger: AppLogger,
): JobCollectionService {
  const events = new DomainEventBus(
    config.ENABLE_NOTIFICATIONS ? [new ConsoleNotificationProvider(logger)] : [],
  );
  return new JobCollectionService(
    db,
    createJobSourceRegistry(config),
    new JobMatchingService(
      db,
      createLLMProvider(config),
      config.AI_ADJUSTMENT_LIMIT,
      config.MATCHING_ENGINE_VERSION,
    ),
    config,
    logger,
    events,
  );
}
