import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../shared/http.js';
import type {
  SubmissionProvider,
  SubmissionRequest,
  SubmissionResult,
} from '../submission/submission.interface.js';
import { GmailConnectionService } from './gmail-connection.service.js';
import { z } from 'zod';

export function validateResume(content: Buffer): void {
  if (
    content.length < 10 ||
    content.length > 2 * 1024 * 1024 ||
    content.subarray(0, 5).toString() !== '%PDF-'
  ) {
    throw new AppError('Envie o currículo PDF original, com no máximo 2 MB', 400);
  }
}

function encodeSubject(subject: string): string {
  const parts: string[] = [];
  let part = '';
  for (const character of subject) {
    if (Buffer.byteLength(part + character) > 42) {
      parts.push(part);
      part = '';
    }
    part += character;
  }
  if (part) parts.push(part);
  return parts.map((value) => `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`).join('\r\n ');
}

export function buildGmailMessage(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  applicationId: string;
  resume: Buffer;
}): string {
  const address = z
    .string()
    .email()
    .max(254)
    .regex(/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+$/);
  address.parse(input.from);
  address.parse(input.to);
  z.string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/)
    .refine((value) => !value.includes(String.fromCharCode(0)))
    .parse(input.subject);
  validateResume(input.resume);
  const boundary = `vagas_${randomBytes(18).toString('hex')}`;
  const encoded = (value: Buffer) =>
    value
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? '';
  const messageId = createHash('sha256').update(input.applicationId).digest('hex');
  return Buffer.from(
    [
      `From: ${input.from}`,
      `To: ${input.to}`,
      `Subject: ${encodeSubject(input.subject)}`,
      `Message-ID: <${messageId}@vagas-agent.invalid>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encoded(Buffer.from(input.body)),
      '',
      `--${boundary}`,
      'Content-Type: application/pdf; name="curriculo.pdf"',
      'Content-Disposition: attachment; filename="curriculo.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      encoded(input.resume),
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  ).toString('base64url');
}

export class GmailSubmissionProvider implements SubmissionProvider {
  readonly id = 'gmail';
  constructor(
    private readonly db: PrismaClient,
    private readonly config: Environment,
    private readonly http: typeof fetch = fetch,
  ) {}

  // Explicit email targets are checked against persisted, authenticated confirmation in submit.
  supports(_source: string, applicationUrl: string | null): boolean {
    return (
      this.config.GMAIL_SEND_ENABLED &&
      !this.config.SAFE_MODE &&
      Boolean(applicationUrl) &&
      new GmailConnectionService(this.db, this.config, this.http).configured()
    );
  }

  async readiness(applicationId: string): Promise<string[]> {
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: {
        emailTarget: true,
        candidate: {
          include: {
            gmailConnection: { select: { accountEmail: true } },
            resumeDocument: { select: { sha256: true } },
          },
        },
      },
    });
    if (!application) return ['Candidatura não encontrada'];
    const blockers: string[] = [];
    if (!application.emailTarget) blockers.push('Canal de e-mail ainda não confirmado no anúncio');
    if (!application.candidate.resumeDocument) blockers.push('Currículo PDF ainda não enviado');
    if (
      !application.candidate.gmailConnection ||
      application.candidate.gmailConnection.accountEmail.toLowerCase() !==
        application.candidate.email.toLowerCase()
    )
      blockers.push('Gmail do perfil ainda não conectado');
    return blockers;
  }

  async submit(request: SubmissionRequest): Promise<SubmissionResult> {
    if (!this.supports(request.source, request.applicationUrl))
      throw new AppError('Envio Gmail desabilitado', 409);
    const application = await this.db.application.findUnique({
      where: { id: request.applicationId },
      include: { emailTarget: true, candidate: { include: { resumeDocument: true } } },
    });
    const target = application?.emailTarget;
    const resume = application?.candidate.resumeDocument;
    if (!application || !target || !resume)
      throw new AppError(
        'Confirme o canal de e-mail e envie o currículo PDF antes da candidatura',
        409,
      );
    const { accessToken, accountEmail } = await new GmailConnectionService(
      this.db,
      this.config,
      this.http,
    ).accessToken(application.candidateId);
    const raw = buildGmailMessage({
      from: accountEmail,
      to: target.recipient,
      subject: target.subject,
      body: `${target.body}\n\nReferência da vaga: ${target.evidenceUrl}`,
      applicationId: application.id,
      resume: Buffer.from(resume.content),
    });
    // Sending is deliberately one-shot. A timeout or malformed response is never retried.
    const response = await this.http(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      throw new AppError('O Gmail não confirmou o envio; verifique a pasta Enviados', 502);
    const result = z
      .object({ id: z.string().min(1) })
      .safeParse(await response.json().catch(() => null));
    if (!result.success) throw new AppError('O Gmail não retornou um identificador de envio', 502);
    return {
      externalApplicationId: result.data.id,
      submittedAt: new Date(),
      metadata: { channel: 'EMAIL' },
    };
  }
}
