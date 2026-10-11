import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { encryptToken } from '../src/integrations/gmail/gmail-connection.service.js';
import {
  buildGmailMessage,
  GmailSubmissionProvider,
} from '../src/integrations/gmail/gmail-submission.provider.js';
import { discoverEmailChannel } from '../src/modules/applications/email-application-channel.service.js';

const resume = Buffer.from('%PDF-1.7\nresume fixture\n%%EOF');
const message = {
  from: 'candidate@example.test',
  to: 'recruiter@example.test',
  subject: 'Candidatura — Suporte Júnior',
  body: 'Currículo em anexo.',
  applicationId: 'app-1',
  resume,
};

describe('Gmail message and send', () => {
  it('anexa o PDF original e conserva assunto Unicode sem permitir cabeçalhos injetados', () => {
    const decoded = Buffer.from(buildGmailMessage(message), 'base64url').toString();
    expect(decoded).toContain('To: recruiter@example.test\r\n');
    expect(decoded).toContain('Content-Type: application/pdf');
    expect(decoded).toContain(resume.toString('base64'));
    const encodedSubject = decoded.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)?.[1];
    expect(Buffer.from(encodedSubject!, 'base64').toString()).toBe(message.subject);
    expect(() =>
      buildGmailMessage({ ...message, subject: 'Vaga\r\nBcc: hidden@example.test' }),
    ).toThrow();
    expect(() =>
      buildGmailMessage({ ...message, to: 'one@example.test,two@example.test' }),
    ).toThrow();
    expect(() => buildGmailMessage({ ...message, resume: Buffer.from('not PDF') })).toThrow(
      'currículo PDF',
    );
  });
  it('dobra assunto longo sem quebrar caracteres UTF-8', () => {
    const subject = 'Vaga de suporte — ação técnica '.repeat(5);
    const decoded = Buffer.from(buildGmailMessage({ ...message, subject }), 'base64url').toString();
    const words = [...decoded.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
    expect(words.map((item) => Buffer.from(item[1]!, 'base64').toString()).join('')).toBe(subject);
    expect(words.every((item) => item[0].length <= 75)).toBe(true);
  });
  it('não tenta enviar no SAFE_MODE e não repete POST após timeout', async () => {
    const key = 'a'.repeat(64);
    const config = {
      ...env,
      SAFE_MODE: false,
      GMAIL_SEND_ENABLED: true,
      GMAIL_CLIENT_ID: 'client',
      GMAIL_CLIENT_SECRET: 'secret',
      GMAIL_REDIRECT_URI: 'https://jobs.example.test/integrations/gmail/callback',
      GMAIL_TOKEN_ENCRYPTION_KEY: key,
    };
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'app-1',
          candidateId: 'candidate-1',
          emailTarget: {
            recipient: message.to,
            subject: message.subject,
            body: message.body,
            evidenceUrl: 'https://employer.example.test/job/1',
          },
          candidate: { resumeDocument: { content: resume }, resumeDocumentEnglish: null },
        }),
      },
      candidateProfile: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'candidate-1', email: message.from, isDemo: false }),
      },
      gmailConnection: {
        findUnique: vi.fn().mockResolvedValue({
          accountEmail: message.from,
          encryptedRefreshToken: encryptToken('refresh-test', key),
        }),
      },
    } as unknown as PrismaClient;
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'access-test' }))
      .mockRejectedValueOnce(new Error('timeout'));
    const request = {
      applicationId: 'app-1',
      source: 'remotive',
      applicationUrl: 'https://employer.example.test/job/1',
      preparation: { payload: {}, reusableAnswers: [] },
    };
    await expect(
      new GmailSubmissionProvider(db, { ...config, SAFE_MODE: true }, http).submit(request),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(http).not.toHaveBeenCalled();
    await expect(new GmailSubmissionProvider(db, config, http).submit(request)).rejects.toThrow(
      'timeout',
    );
    expect(
      http.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('/messages/send')),
    ).toHaveLength(1);
  });
});

describe('explicit email channel discovery', () => {
  it.each([
    'Envie seu currículo para recruiter@example.test',
    'Send your resume to recruiter@example.test',
  ])('reconhece instrução explícita: %s', (text) => {
    expect(discoverEmailChannel(text)).toMatchObject({
      recipient: 'recruiter@example.test',
      evidenceQuote: text,
    });
  });
  it.each([
    'Contato para dúvidas: recruiter@example.test. Candidate-se pelo portal.',
    'Não envie currículo para recruiter@example.test. Use o portal.',
    'Do not send your resume to recruiter@example.test.',
    'Envie currículo para one@example.test ou two@example.test.',
    'Envie currículo para recruiter@example.test com assunto obrigatório: Especial.',
    'Envie currículo pelo portal. Para dúvidas: recruiter@example.test',
    'Send your resume via the portal, for assistance email help@example.test',
    'Envie seu currículo pelo portal, para dúvidas use help@example.test',
  ])('mantém caso ambíguo ou incompatível no fluxo assistido: %s', (text) => {
    expect(discoverEmailChannel(text)).toBeNull();
  });
});
