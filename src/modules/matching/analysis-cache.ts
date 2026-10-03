import { createHash } from 'node:crypto';

export function createAnalysisInputHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
