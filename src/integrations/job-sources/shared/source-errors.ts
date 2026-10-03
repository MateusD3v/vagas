import type { CollectionErrorType } from '@prisma/client';

export class JobSourceError extends Error {
  constructor(
    message: string,
    public readonly errorType: CollectionErrorType,
    public readonly retryable: boolean,
    public readonly httpStatus?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'JobSourceError';
  }
}

export function normalizeSourceError(error: unknown): JobSourceError {
  if (error instanceof JobSourceError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new JobSourceError('Tempo limite da fonte excedido', 'TIMEOUT', true);
  }
  if (error instanceof Error) {
    return new JobSourceError(error.message, 'NETWORK_ERROR', true);
  }
  return new JobSourceError('Erro desconhecido na fonte', 'UNKNOWN', false);
}
