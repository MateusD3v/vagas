import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import {
  GmailConnectionService,
  encryptToken,
  decryptToken,
  gmailSendScope,
} from '../src/integrations/gmail/gmail-connection.service.js';

const config = {
  ...env,
  GMAIL_CLIENT_ID: 'test-client',
  GMAIL_CLIENT_SECRET: 'test-secret',
  GMAIL_REDIRECT_URI: 'https://jobs.example.test/integrations/gmail/callback',
  GMAIL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
};
const candidate = { id: 'candidate-1', email: 'candidate@example.test', isDemo: false };

function fixture() {
  const db = {
    candidateProfile: { findUnique: vi.fn().mockResolvedValue(candidate) },
    gmailAuthorization: {
      create: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi
        .fn()
        .mockResolvedValue({ candidateId: candidate.id, expiresAt: new Date(Date.now() + 60000) }),
    },
    gmailConnection: {
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({
        accountEmail: candidate.email,
        encryptedRefreshToken: encryptToken('refresh-test', config.GMAIL_TOKEN_ENCRYPTION_KEY),
      }),
      deleteMany: vi.fn(),
    },
    candidateResume: { findUnique: vi.fn().mockResolvedValue(null) },
    auditLog: { create: vi.fn() },
  };
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'access-test',
        refresh_token: 'refresh-test',
        scope: `${gmailSendScope} openid email`,
      }),
    )
    .mockResolvedValueOnce(Response.json({ email: candidate.email, email_verified: true }));
  return {
    db,
    http,
    service: new GmailConnectionService(db as unknown as PrismaClient, config, http),
  };
}

describe('Gmail authorization', () => {
  it('solicita somente envio e identidade, guarda apenas hash e expira o estado', async () => {
    const { service, db } = fixture();
    const result = await service.authorize(candidate.id);
    const url = new URL(result.url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe(`${gmailSendScope} openid email`);
    expect(url.searchParams.get('access_type')).toBe('offline');
    const created = db.gmailAuthorization.create.mock.calls[0]?.[0] as {
      data: { stateHash: string; expiresAt: Date };
    };
    expect(created.data.stateHash).not.toContain(result.state);
    expect(created.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  it('exige estado vinculado ao cookie e bloqueia replay antes de consultar Google', async () => {
    const { service, db, http } = fixture();
    const state = 's'.repeat(43);
    await expect(service.complete('code', state, 'different')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(http).not.toHaveBeenCalled();
    db.gmailAuthorization.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.complete('code', state, state)).rejects.toMatchObject({ statusCode: 400 });
    expect(http).not.toHaveBeenCalled();
  });
  it('criptografa token offline e nunca o inclui na resposta de status', async () => {
    const { service, db } = fixture();
    const state = 's'.repeat(43);
    await service.complete('code-test', state, state);
    const saved = db.gmailConnection.upsert.mock.calls[0]?.[0] as {
      create: { encryptedRefreshToken: string };
    };
    expect(saved.create.encryptedRefreshToken).not.toContain('refresh-test');
    expect(
      decryptToken(saved.create.encryptedRefreshToken, config.GMAIL_TOKEN_ENCRYPTION_KEY),
    ).toBe('refresh-test');
    db.gmailConnection.findUnique.mockResolvedValueOnce({
      accountEmail: candidate.email,
      connectedAt: new Date(),
    });
    const status = await service.status(candidate.id);
    expect(db.gmailConnection.findUnique).toHaveBeenLastCalledWith({
      where: { candidateId: candidate.id },
      select: { accountEmail: true, connectedAt: true },
    });
    // Prisma's select is the disclosure boundary, verified above.
    expect(JSON.stringify(status)).not.toContain('refresh-test');
    expect(JSON.stringify(status)).not.toContain('encryptedRefreshToken');
  });
  it.each([
    { email: 'other@example.test', email_verified: true },
    { email: candidate.email, email_verified: false },
  ])('recusa identidade incompatível: %j', async (identity) => {
    const { service, db, http } = fixture();
    http
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'access-test',
          refresh_token: 'refresh-test',
          scope: gmailSendScope,
        }),
      )
      .mockResolvedValueOnce(Response.json(identity));
    const state = 's'.repeat(43);
    await expect(service.complete('code', state, state)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.gmailConnection.upsert).not.toHaveBeenCalled();
  });
  it('recusa estado expirado e permissão de envio negada', async () => {
    const { service, db, http } = fixture();
    const state = 's'.repeat(43);
    db.gmailAuthorization.findUnique.mockResolvedValueOnce({
      candidateId: candidate.id,
      expiresAt: new Date(0),
    });
    await expect(service.complete('code', state, state)).rejects.toMatchObject({ statusCode: 400 });
    expect(http).not.toHaveBeenCalled();
    http.mockReset().mockResolvedValueOnce(
      Response.json({
        access_token: 'access-test',
        refresh_token: 'refresh-test',
        scope: 'openid email',
      }),
    );
    await expect(service.complete('code', state, state)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.gmailConnection.upsert).not.toHaveBeenCalled();
  });
  it('recusa token adulterado e não expõe respostas de erro do Google', async () => {
    const encrypted = encryptToken('secret-token', config.GMAIL_TOKEN_ENCRYPTION_KEY);
    expect(() => decryptToken(encrypted, 'b'.repeat(64))).toThrow('Credencial Gmail inválida');
    const { service, http } = fixture();
    http
      .mockReset()
      .mockResolvedValueOnce(Response.json({ error_description: 'secret-token' }, { status: 400 }));
    await expect(service.accessToken(candidate.id)).rejects.toThrow('Autorização Gmail recusada');
  });
});
