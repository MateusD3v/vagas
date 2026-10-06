import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../shared/http.js';

export const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send';
export const gmailCallbackPath = '/integrations/gmail/callback';
export const gmailStateCookie = 'vagas_gmail_state';

export function encryptToken(token: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptToken(value: string, keyHex: string): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new AppError('Credencial Gmail inválida; reconecte a conta', 409);
  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !tag || !ciphertext) throw new Error('Invalid token');
    const cipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString('utf8');
  } catch {
    throw new AppError('Credencial Gmail inválida; reconecte a conta', 409);
  }
}

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

export class GmailConnectionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly config: Environment,
    private readonly http: typeof fetch = fetch,
  ) {}

  configured(): boolean {
    return Boolean(
      this.config.GMAIL_CLIENT_ID &&
      this.config.GMAIL_CLIENT_SECRET &&
      this.config.GMAIL_REDIRECT_URI &&
      this.config.GMAIL_TOKEN_ENCRYPTION_KEY,
    );
  }

  private credentials() {
    if (!this.configured())
      throw new AppError('Configure o OAuth do Gmail no servidor antes de conectar', 409);
    const redirect = new URL(this.config.GMAIL_REDIRECT_URI!);
    if (
      redirect.pathname !== gmailCallbackPath ||
      redirect.search ||
      redirect.hash ||
      (redirect.protocol !== 'https:' &&
        !(this.config.NODE_ENV !== 'production' && redirect.hostname === 'localhost'))
    ) {
      throw new AppError(
        'GMAIL_REDIRECT_URI deve apontar para o callback HTTPS deste serviço',
        409,
      );
    }
    return {
      client_id: this.config.GMAIL_CLIENT_ID!,
      client_secret: this.config.GMAIL_CLIENT_SECRET!,
      redirect_uri: redirect.toString(),
      encryptionKey: this.config.GMAIL_TOKEN_ENCRYPTION_KEY!,
    };
  }

  async status(candidateId: string) {
    const [connection, resume] = await Promise.all([
      this.db.gmailConnection.findUnique({
        where: { candidateId },
        select: { accountEmail: true, connectedAt: true },
      }),
      this.db.candidateResume.findUnique({
        where: { candidateId },
        select: { updatedAt: true, sha256: true },
      }),
    ]);
    return {
      configured: this.configured(),
      connected: Boolean(connection),
      account: connection,
      resumeReady: Boolean(resume),
      resumeUpdatedAt: resume?.updatedAt ?? null,
      safeMode: this.config.SAFE_MODE,
      sendEnabled: this.config.GMAIL_SEND_ENABLED,
      automaticEnabled: this.config.AUTO_SUBMIT_APPLICATIONS,
    };
  }

  async authorize(candidateId: string) {
    const credentials = this.credentials();
    const candidate = await this.db.candidateProfile.findUnique({ where: { id: candidateId } });
    if (!candidate || candidate.isDemo) throw new AppError('Um perfil real é necessário', 409);
    const state = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.db.gmailAuthorization.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.db.gmailAuthorization.create({
      data: {
        stateHash: createHash('sha256').update(state).digest('hex'),
        candidateId,
        expiresAt: new Date(now.getTime() + 10 * 60_000),
      },
    });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: credentials.client_id,
      redirect_uri: credentials.redirect_uri,
      response_type: 'code',
      scope: `${gmailSendScope} openid email`,
      access_type: 'offline',
      prompt: 'consent',
      login_hint: candidate.email,
      state,
    }).toString();
    return { url: url.toString(), state };
  }

  private async tokenRequest(parameters: Record<string, string>) {
    let response: Response;
    try {
      response = await this.http('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch {
      throw new AppError('Não foi possível autorizar o Gmail; tente reconectar', 502);
    }
    if (!response.ok)
      throw new AppError('Autorização Gmail recusada ou expirada; reconecte a conta', 409);
    const parsed = tokensSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AppError('Resposta de autorização Gmail inválida', 502);
    return parsed.data;
  }

  async complete(code: string, state: string, cookieState: string | undefined): Promise<void> {
    const credentials = this.credentials();
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !cookieState ||
      Buffer.byteLength(state) !== Buffer.byteLength(cookieState) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
    ) {
      throw new AppError('Autorização inválida; inicie a conexão novamente', 400);
    }
    const stateHash = createHash('sha256').update(state).digest('hex');
    const authorization = await this.db.gmailAuthorization.findUnique({ where: { stateHash } });
    if (!authorization || authorization.expiresAt.getTime() <= Date.now()) {
      throw new AppError('Autorização expirada ou já utilizada', 400);
    }
    const consumed = await this.db.gmailAuthorization.deleteMany({
      where: { stateHash, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw new AppError('Autorização já utilizada', 400);
    const tokens = await this.tokenRequest({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      redirect_uri: credentials.redirect_uri,
      grant_type: 'authorization_code',
      code,
    });
    if (!tokens.refresh_token || !tokens.scope?.split(' ').includes(gmailSendScope)) {
      throw new AppError('A permissão de envio e o acesso offline são necessários; reconecte', 409);
    }
    let account: unknown;
    try {
      const response = await this.http('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Identity unavailable');
      account = await response.json();
    } catch {
      throw new AppError('Não foi possível confirmar a identidade da conta Gmail', 502);
    }
    const identity = z
      .object({ email: z.string().email(), email_verified: z.literal(true) })
      .safeParse(account);
    const candidate = await this.db.candidateProfile.findUnique({
      where: { id: authorization.candidateId },
    });
    if (
      !identity.success ||
      !candidate ||
      candidate.isDemo ||
      identity.data.email.toLowerCase() !== candidate.email.toLowerCase()
    ) {
      throw new AppError('A conta conectada deve ser a mesma do perfil do candidato', 409);
    }
    const encryptedRefreshToken = encryptToken(tokens.refresh_token, credentials.encryptionKey);
    await this.db.gmailConnection.upsert({
      where: { candidateId: candidate.id },
      create: {
        candidateId: candidate.id,
        accountEmail: identity.data.email,
        encryptedRefreshToken,
      },
      update: { accountEmail: identity.data.email, encryptedRefreshToken, connectedAt: new Date() },
    });
    await this.db.auditLog.create({
      data: {
        event: 'GMAIL_CONNECTED',
        entityType: 'CandidateProfile',
        entityId: candidate.id,
        metadata: {},
      },
    });
  }

  async accessToken(candidateId: string) {
    const credentials = this.credentials();
    const [connection, candidate] = await Promise.all([
      this.db.gmailConnection.findUnique({ where: { candidateId } }),
      this.db.candidateProfile.findUnique({ where: { id: candidateId } }),
    ]);
    if (
      !connection ||
      !candidate ||
      candidate.isDemo ||
      connection.accountEmail.toLowerCase() !== candidate.email.toLowerCase()
    ) {
      throw new AppError('Conecte o Gmail correspondente ao perfil antes de enviar', 409);
    }
    const tokens = await this.tokenRequest({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      grant_type: 'refresh_token',
      refresh_token: decryptToken(connection.encryptedRefreshToken, credentials.encryptionKey),
    });
    return { accessToken: tokens.access_token, accountEmail: connection.accountEmail };
  }

  async disconnect(candidateId: string): Promise<void> {
    // Local deletion immediately stops use; revoke access in Google Account as well.
    await this.db.gmailConnection.deleteMany({ where: { candidateId } });
    await this.db.gmailAuthorization.deleteMany({ where: { candidateId } });
    await this.db.auditLog.create({
      data: {
        event: 'GMAIL_DISCONNECTED',
        entityType: 'CandidateProfile',
        entityId: candidateId,
        metadata: {},
      },
    });
  }
}
