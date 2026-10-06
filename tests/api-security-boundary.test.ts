import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/client.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    workerHeartbeat: {
      findUnique: vi.fn().mockResolvedValue({
        workerName: 'job-collection-worker',
        status: 'IDLE',
        lastSeenAt: new Date(),
      }),
    },
    candidateProfile: {
      findFirst: vi.fn().mockResolvedValue({ isDemo: false }),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

import { env } from '../src/config/env.js';
import { buildApp } from '../src/app.js';

const originalAdminKey = env.ADMIN_API_KEY;
env.ADMIN_API_KEY = 'test-admin-key';

afterEach(() => {
  vi.restoreAllMocks();
  env.ADMIN_API_KEY = 'test-admin-key';
});

describe('fronteira pública da API', () => {
  afterAll(() => {
    env.ADMIN_API_KEY = originalAdminKey;
  });
  it('mantém health e dashboard públicos', async () => {
    const app = await buildApp();

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/dashboard' })).statusCode).toBe(200);

    await app.close();
  });

  it('mantém somente o callback OAuth público e recusa estado ausente', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/integrations/gmail/callback?code=test-code&state=invalid',
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('test-code');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    await app.close();
  });
  it.each([
    { method: 'POST' as const, url: '/integrations/gmail/authorize' },
    { method: 'PUT' as const, url: '/integrations/gmail/resume' },
    { method: 'DELETE' as const, url: '/integrations/gmail' },
    {
      method: 'PUT' as const,
      url: '/applications/11111111-1111-4111-8111-111111111111/email-target',
    },
  ])('protege as escritas Gmail: $method $url', async (request) => {
    const app = await buildApp();
    expect((await app.inject(request)).statusCode).toBe(401);
    await app.close();
  });
  it.each([
    '/profile',
    '/candidate-answers',
    '/applications',
    '/job-search-profile',
    '/matches',
    '/worker/status',
    '/stats',
    '/collection-runs',
    '/audit-logs',
    '/integrations/gmail/status',
    '/integrations/gmail/callback/private',
    '/applications/11111111-1111-4111-8111-111111111111/submission-attempt',
  ])('bloqueia leitura privada sem X-Admin-Key: %s', async (url) => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
