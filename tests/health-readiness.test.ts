import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { buildApp } from '../src/app.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /health', () => {
  it('expõe readiness operacional sem transformar degradação do worker em falha HTTP', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      database: 'connected',
      profile: { status: 'ready', collectionReady: true },
    });
    expect(['ready', 'degraded']).toContain(response.json().readiness);

    await app.close();
  });
});
