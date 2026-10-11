import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/client.js';
import {
  GmailConnectionService,
  gmailCallbackPath,
  gmailStateCookie,
} from '../../integrations/gmail/gmail-connection.service.js';
import { validateResume } from '../../integrations/gmail/gmail-submission.provider.js';
import { lockCandidateSubmissions } from '../applications/submission-lock.js';
import { adminRateLimit } from '../../shared/admin-security.js';
import { AppError, idParamsSchema } from '../../shared/http.js';

const callbackSchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().length(43),
});
const emailTargetSchema = z.object({
  recipient: z
    .string()
    .email()
    .max(254)
    .regex(/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+$/),
  subject: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/)
    .refine((value) => !value.includes(String.fromCharCode(0))),
  body: z.string().min(1).max(8000),
  evidenceUrl: z
    .string()
    .url()
    .refine((url) => new URL(url).protocol === 'https:'),
  evidenceQuote: z.string().min(1).max(4000),
  confirmedEmailChannel: z.literal(true),
  resumeLanguage: z.enum(['PT', 'EN']).default('PT'),
});

async function candidateId() {
  const candidate = await prisma.candidateProfile.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, isDemo: true },
  });
  if (!candidate || candidate.isDemo)
    throw new AppError('Cadastre um perfil real antes de conectar o Gmail', 409);
  return candidate.id;
}

export function gmailRoutes(app: FastifyInstance): void {
  const connections = new GmailConnectionService(prisma, env);
  const protectedOptions = {
    config: { rateLimit: adminRateLimit },
    schema: { tags: ['Applications'] },
  };
  const cookieAttributes = `Path=${gmailCallbackPath}; HttpOnly; SameSite=Lax${env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  app.get('/integrations/gmail/status', protectedOptions, async () =>
    connections.status(await candidateId()),
  );
  app.post('/integrations/gmail/authorize', protectedOptions, async (_request, reply) => {
    const authorization = await connections.authorize(await candidateId());
    reply.header('cache-control', 'no-store');
    reply.header(
      'set-cookie',
      `${gmailStateCookie}=${authorization.state}; ${cookieAttributes}; Max-Age=600`,
    );
    return { url: authorization.url };
  });
  app.get(
    gmailCallbackPath,
    { config: { rateLimit: adminRateLimit }, schema: { hide: true } },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      reply.header('referrer-policy', 'no-referrer');
      reply.header('set-cookie', `${gmailStateCookie}=; ${cookieAttributes}; Max-Age=0`);
      const parsed = callbackSchema.safeParse(request.query);
      const cookie = request.headers.cookie
        ?.split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${gmailStateCookie}=`))
        ?.slice(gmailStateCookie.length + 1);
      try {
        if (!parsed.success) throw new AppError('Autorização cancelada ou inválida', 400);
        await connections.complete(parsed.data.code, parsed.data.state, cookie);
        return reply.redirect('/dashboard#gmail-conectado');
      } catch {
        // Never return or log OAuth codes, tokens or upstream errors.
        return reply
          .code(400)
          .type('text/html; charset=utf-8')
          .send(
            '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexão Gmail</title><p>Não foi possível conectar o Gmail. Volte ao painel, confirme a conta do perfil e tente novamente.</p><a href="/dashboard">Voltar ao painel</a></html>',
          );
      }
    },
  );
  app.delete('/integrations/gmail', protectedOptions, async () => {
    await connections.disconnect(await candidateId());
    return { disconnected: true };
  });
  app.put(
    '/integrations/gmail/resume',
    { ...protectedOptions, bodyLimit: 3 * 1024 * 1024 },
    async (request) => {
      const { contentBase64 } = z
        .object({
          contentBase64: z
            .string()
            .max(2_800_000)
            .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        })
        .parse(request.body);
      const content = Buffer.from(contentBase64, 'base64');
      validateResume(content);
      const id = await candidateId();
      const sha256 = createHash('sha256').update(content).digest('hex');
      await prisma.candidateResume.upsert({
        where: { candidateId: id },
        create: { candidateId: id, content, sha256 },
        update: { content, sha256 },
      });
      await prisma.auditLog.create({
        data: {
          event: 'RESUME_PDF_UPDATED',
          entityType: 'CandidateProfile',
          entityId: id,
          metadata: { sha256 },
        },
      });
      return { resumeReady: true };
    },
  );
  // English and Portuguese documents are stored separately and never committed to Git.
  app.put(
    '/integrations/gmail/resume/en',
    { ...protectedOptions, bodyLimit: 3 * 1024 * 1024 },
    async (request) => {
      const { contentBase64 } = z
        .object({
          contentBase64: z
            .string()
            .max(2_800_000)
            .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        })
        .parse(request.body);
      const content = Buffer.from(contentBase64, 'base64');
      validateResume(content);
      const id = await candidateId();
      const sha256 = createHash('sha256').update(content).digest('hex');
      await prisma.candidateResumeEnglish.upsert({
        where: { candidateId: id },
        create: { candidateId: id, content, sha256 },
        update: { content, sha256 },
      });
      await prisma.auditLog.create({
        data: {
          event: 'RESUME_ENGLISH_PDF_UPDATED',
          entityType: 'CandidateProfile',
          entityId: id,
          metadata: { sha256 },
        },
      });
      return { resumeEnglishReady: true };
    },
  );
  app.put('/applications/:id/email-target', protectedOptions, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const input = emailTargetSchema.parse(request.body);
    if (!input.evidenceQuote.toLowerCase().includes(input.recipient.toLowerCase()))
      throw new AppError('O trecho do anúncio deve indicar o endereço de candidatura', 400);
    const candidate = await prisma.application.findUnique({
      where: { id },
      select: { candidateId: true },
    });
    if (!candidate) throw new AppError('Candidatura não encontrada', 404);
    const result = await prisma.$transaction(async (tx) => {
      await lockCandidateSubmissions(tx, candidate.candidateId);
      const application = await tx.application.findUnique({
        where: { id },
        include: { submissionAttempt: true },
      });
      if (!application || application.submissionAttempt || application.submittedAt)
        throw new AppError(
          'Esta candidatura já possui tentativa de envio; não altere o destinatário',
          409,
        );
      const target = {
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        evidenceUrl: input.evidenceUrl,
        evidenceQuote: input.evidenceQuote,
        resumeLanguage: input.resumeLanguage,
        confirmationSource: 'ADMIN',
      };
      const result = await tx.emailApplicationTarget.upsert({
        where: { applicationId: id },
        create: { applicationId: id, ...target },
        update: { ...target, confirmedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          event: 'EMAIL_APPLICATION_CHANNEL_CONFIRMED',
          entityType: 'Application',
          entityId: id,
          metadata: { evidenceUrl: input.evidenceUrl },
        },
      });
      return result;
    });
    return result;
  });
  app.get('/applications/:id/submission-attempt', protectedOptions, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { attempt: await prisma.submissionAttempt.findUnique({ where: { applicationId: id } }) };
  });
}
