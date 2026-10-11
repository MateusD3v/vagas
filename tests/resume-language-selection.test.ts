import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { GmailSubmissionProvider } from '../src/integrations/gmail/gmail-submission.provider.js';

const pdf = Buffer.from('%PDF-1.7\nTEST FILE\n%%EOF');
const config = {
  ...env, SAFE_MODE: false, GMAIL_SEND_ENABLED: true,
  GMAIL_CLIENT_ID: 'client', GMAIL_CLIENT_SECRET: 'secret',
  GMAIL_REDIRECT_URI: 'https://jobs.example.test/integrations/gmail/callback',
  GMAIL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
};

function provider(language: 'PT' | 'EN', hasEnglish: boolean) {
  const db = {
    application: { findUnique: vi.fn().mockResolvedValue({
      emailTarget: { resumeLanguage: language },
      candidate: {
        resumeDocument: { sha256: 'pt' },
        resumeDocumentEnglish: hasEnglish ? { sha256: 'en' } : null,
        gmailConnection: { accountEmail: 'candidate@example.test' },
        email: 'candidate@example.test',
      },
    }) },
  };
  return new GmailSubmissionProvider(db as unknown as PrismaClient, config);
}

describe('language-specific private PDF readiness', () => {
  it('does not silently substitute the Portuguese PDF when English is required', async () => {
    await expect(provider('EN', false).readiness('app-id')).resolves.toContain('Currículo PDF em inglês ainda não enviado');
  });
  it('permits Portuguese independently of English PDF', async () => {
    await expect(provider('PT', false).readiness('app-id')).resolves.toEqual([]);
  });
  it('recognizes uploaded English PDF', async () => {
    await expect(provider('EN', true).readiness('app-id')).resolves.toEqual([]);
  });
});
