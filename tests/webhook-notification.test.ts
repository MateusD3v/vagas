import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebhookNotificationProvider } from '../src/integrations/notifications/webhook.provider.js';
import type { AppLogger } from '../src/shared/logger.js';

const warn = vi.fn<(bindings: object, message: string) => void>();
const logger: AppLogger = {
  warn,
  info: vi.fn<(bindings: object, message: string) => void>(),
  error: vi.fn<(bindings: object, message: string) => void>(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  warn.mockClear();
});

describe('WebhookNotificationProvider', () => {
  it('envia evento APPLY em JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new WebhookNotificationProvider('https://example.test/hook', 1000, logger);

    await provider.notifyNewApply({
      id: 'match-1',
      jobId: 'job-1',
      candidateId: 'candidate-1',
      deterministicScore: 80,
      aiAdjustment: 5,
      score: 85,
      decision: 'APPLY',
      matchedSkills: [],
      missingSkills: [],
      strengths: [],
      weaknesses: [],
      hardConstraints: [],
      reasoning: 'ok',
      analysisInputHash: null,
      engineVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    const body = init?.body;
    if (typeof body !== 'string') throw new Error('Webhook body deveria ser JSON string');
    expect(JSON.parse(body)).toMatchObject({
      event: 'HIGH_MATCH_FOUND',
      data: { jobId: 'job-1', score: 85, decision: 'APPLY' },
    });
  });
  it('envia acompanhamentos vencidos em JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new WebhookNotificationProvider('https://example.test/hook', 1000, logger);

    await provider.notifyFollowUpsDue(['application-1', 'application-2']);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = init?.body;
    if (typeof body !== 'string') throw new Error('Webhook body deveria ser JSON string');
    expect(JSON.parse(body)).toMatchObject({
      event: 'FOLLOW_UP_DUE',
      data: { count: 2, applicationIds: ['application-1', 'application-2'] },
    });
  });

  it('não derruba o pipeline quando o webhook falha', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('network down')));
    const provider = new WebhookNotificationProvider('https://example.test/hook', 1000, logger);

    await expect(provider.notifySourceFailure('remotive', '429')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
