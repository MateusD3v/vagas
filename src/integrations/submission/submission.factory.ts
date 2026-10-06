import type { PrismaClient } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import { GmailSubmissionProvider } from '../gmail/gmail-submission.provider.js';
import { SubmissionProviderRegistry } from './submission.registry.js';

export function createSubmissionProviders(db: PrismaClient, config: Environment) {
  return new SubmissionProviderRegistry(
    config.GMAIL_SEND_ENABLED && !config.SAFE_MODE ? [new GmailSubmissionProvider(db, config)] : [],
  );
}
