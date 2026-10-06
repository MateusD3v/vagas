import { describe, expect, it, vi } from 'vitest';
import { JobSourceHttpClient } from '../src/integrations/job-sources/shared/http-client.js';
import { JobSourceError } from '../src/integrations/job-sources/shared/source-errors.js';

const success = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

describe('JobSourceHttpClient', () => {
  it('repete erros 5xx e usa backoff', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(success());
    const sleep = vi.fn(async (milliseconds: number) => {
      void milliseconds;
      return Promise.resolve();
    });
    const client = new JobSourceHttpClient(
      { timeoutMs: 1000, maxRetries: 1, userAgent: 'test-agent' },
      fetchMock,
      sleep,
    );
    await expect(client.getJson('https://example.test', { source: 'test' })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('não repete 401', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 }));
    const client = new JobSourceHttpClient(
      { timeoutMs: 1000, maxRetries: 3, userAgent: 'test-agent' },
      fetchMock,
      vi.fn(async () => Promise.resolve()),
    );
    await expect(client.getJson('https://example.test', { source: 'test' })).rejects.toMatchObject({
      errorType: 'AUTHENTICATION_ERROR',
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifica timeout e não deixa a requisição presa', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const client = new JobSourceHttpClient(
      { timeoutMs: 5, maxRetries: 0, userAgent: 'test-agent' },
      fetchMock,
    );
    await expect(client.getJson('https://example.test', { source: 'test' })).rejects.toMatchObject({
      errorType: 'TIMEOUT',
    });
  });

  it('respeita Retry-After em 429', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(success());
    const sleep = vi.fn(async (milliseconds: number) => {
      void milliseconds;
      return Promise.resolve();
    });
    const client = new JobSourceHttpClient(
      { timeoutMs: 1000, maxRetries: 1, userAgent: 'test-agent' },
      fetchMock,
      sleep,
    );
    await client.getJson('https://example.test', { source: 'test', requestsPerSecond: 1000 });
    expect(sleep.mock.calls.some(([delay]) => delay === 2000)).toBe(true);
  });

  it('lê respostas de texto preservando retry e headers', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<rss><channel /></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      }),
    );
    const client = new JobSourceHttpClient(
      { timeoutMs: 1000, maxRetries: 0, userAgent: 'test-agent' },
      fetchMock,
      vi.fn(async () => Promise.resolve()),
    );

    await expect(
      client.getText('https://example.test/feed.rss', {
        source: 'rss-test',
        headers: { Accept: 'application/rss+xml' },
      }),
    ).resolves.toBe('<rss><channel /></rss>');

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({
      Accept: 'application/rss+xml',
      'User-Agent': 'test-agent',
    });
  });

  it('retorna a URL final após redirects públicos', async () => {
    const response = new Response('', { status: 200 });
    Object.defineProperty(response, 'url', {
      value: 'https://boards.greenhouse.io/acme/jobs/123',
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    const client = new JobSourceHttpClient(
      { timeoutMs: 1000, maxRetries: 0, userAgent: 'test-agent' },
      fetchMock,
      vi.fn(async () => Promise.resolve()),
    );

    await expect(
      client.getFinalUrl('https://example.test/apply', {
        source: 'redirect-test',
      }),
    ).resolves.toBe('https://boards.greenhouse.io/acme/jobs/123');

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe('GET');
    expect(request?.redirect).toBe('follow');
    expect(request?.headers).toMatchObject({
      'User-Agent': 'test-agent',
    });
  });

  it('envia POST de texto com JSON, headers e rate limit compartilhado', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('event: message\ndata: {"ok":true}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const client = new JobSourceHttpClient(
      { timeoutMs: 1000, maxRetries: 0, userAgent: 'test-agent' },
      fetchMock,
      vi.fn(async () => Promise.resolve()),
    );

    await expect(
      client.postText(
        'https://example.test/mcp',
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        {
          source: 'mcp-test',
          headers: {
            Accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2025-06-18',
          },
        },
      ),
    ).resolves.toContain('event: message');

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe('POST');
    expect(request?.body).toBe(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    );
    expect(request?.headers).toMatchObject({
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'User-Agent': 'test-agent',
      'mcp-protocol-version': '2025-06-18',
    });
  });

  it('preserva erros normalizados', () => {
    const error = new JobSourceError('rate', 'RATE_LIMIT', true, 429, 1000);
    expect(error.httpStatus).toBe(429);
  });
});
