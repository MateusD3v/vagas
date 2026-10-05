import { JobSourceError, normalizeSourceError } from './source-errors.js';

export interface HttpClientConfig {
  timeoutMs: number;
  maxRetries: number;
  userAgent: string;
}

export interface HttpRequestOptions {
  source: string;
  requestsPerSecond?: number;
  headers?: Record<string, string>;
}

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export class JobSourceHttpClient {
  private readonly lastRequestAt = new Map<string, number>();

  constructor(
    private readonly config: HttpClientConfig,
    private readonly fetchImplementation: FetchLike = fetch,
    private readonly sleep: Sleep = defaultSleep,
  ) {}

  async getJson<T>(url: string, options: HttpRequestOptions): Promise<T> {
    let lastError: JobSourceError | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      if (attempt > 0 && lastError) {
        const delay = lastError.retryAfterMs ?? 1000 * 3 ** (attempt - 1);
        await this.sleep(delay);
      }
      try {
        await this.enforceRateLimit(options.source, options.requestsPerSecond ?? 1);
        return await this.request<T>(url, options);
      } catch (error) {
        lastError = normalizeSourceError(error);
        if (!lastError.retryable || attempt === this.config.maxRetries) throw lastError;
      }
    }
    throw lastError ?? new JobSourceError('Falha inesperada na fonte', 'UNKNOWN', false);
  }

  async getText(url: string, options: HttpRequestOptions): Promise<string> {
    let lastError: JobSourceError | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      if (attempt > 0 && lastError) {
        const delay = lastError.retryAfterMs ?? 1000 * 3 ** (attempt - 1);
        await this.sleep(delay);
      }
      try {
        await this.enforceRateLimit(options.source, options.requestsPerSecond ?? 1);
        return await this.requestText(url, options);
      } catch (error) {
        lastError = normalizeSourceError(error);
        if (!lastError.retryable || attempt === this.config.maxRetries) throw lastError;
      }
    }
    throw lastError ?? new JobSourceError('Falha inesperada na fonte', 'UNKNOWN', false);
  }

  private async enforceRateLimit(source: string, requestsPerSecond: number): Promise<void> {
    const interval = Math.ceil(1000 / Math.max(0.01, requestsPerSecond));
    const previous = this.lastRequestAt.get(source) ?? 0;
    const wait = interval - (Date.now() - previous);
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt.set(source, Date.now());
  }

  private async requestText(url: string, options: HttpRequestOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImplementation(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'text/plain, application/xml, application/rss+xml, */*',
          'User-Agent': this.config.userAgent,
          ...options.headers,
        },
      });
      this.assertSuccessfulResponse(response);
      return await response.text();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new JobSourceError('Tempo limite da fonte excedido', 'TIMEOUT', true);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request<T>(url: string, options: HttpRequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImplementation(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': this.config.userAgent,
          ...options.headers,
        },
      });
      this.assertSuccessfulResponse(response);
      try {
        return (await response.json()) as T;
      } catch {
        throw new JobSourceError(
          'JSON inválido retornado pela fonte',
          'INVALID_RESPONSE',
          false,
          response.status,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new JobSourceError('Tempo limite da fonte excedido', 'TIMEOUT', true);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertSuccessfulResponse(response: Response): void {
    if (response.ok) return;
    const status = response.status;
    if (status === 429) {
      throw new JobSourceError(
        'Rate limit informado pela fonte',
        'RATE_LIMIT',
        true,
        status,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    }
    if (status === 401 || status === 403) {
      throw new JobSourceError(
        'Acesso não autorizado pela fonte',
        'AUTHENTICATION_ERROR',
        false,
        status,
      );
    }
    if (status >= 500) {
      throw new JobSourceError(
        `Fonte indisponível (HTTP ${status})`,
        'SOURCE_UNAVAILABLE',
        true,
        status,
      );
    }
    throw new JobSourceError(`Resposta HTTP ${status}`, 'INVALID_RESPONSE', false, status);
  }
}
