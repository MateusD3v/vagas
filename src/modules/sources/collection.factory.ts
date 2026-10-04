import type { PrismaClient } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { JobSourceRegistry } from '../../integrations/job-sources/job-source.registry.js';
import { createJobSourceRegistry } from '../../integrations/job-sources/registry.factory.js';
import { createLLMProvider } from '../../integrations/llm/provider.factory.js';
import { createNotificationProviders } from '../../integrations/notifications/notification.factory.js';
import { DomainEventBus } from '../../shared/domain-event-bus.js';
import type { AppLogger } from '../../shared/logger.js';
import { JobMatchingService } from '../matching/job-matching.service.js';
import { JobCollectionService } from './job-collection.service.js';

export function createCollectionService(
  db: PrismaClient,
  config: Environment,
  logger: AppLogger,
  registry: JobSourceRegistry = createJobSourceRegistry(config),
): JobCollectionService {
  const events = new DomainEventBus(createNotificationProviders(config, logger));
  return new JobCollectionService(
    db,
    registry,
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
