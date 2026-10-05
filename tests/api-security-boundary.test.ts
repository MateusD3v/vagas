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
  ])('bloqueia leitura privada sem X-Admin-Key: %s', async (url) => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
