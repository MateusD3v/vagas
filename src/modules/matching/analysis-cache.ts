import { createHash } from 'node:crypto';

export function createAnalysisInputHash(input: unknown): string {
  // Invalidate cached scores when the built-in scoring rules change, including
  // deployments that keep an explicit MATCHING_ENGINE_VERSION override.
  return createHash('sha256')
    .update('required-skills-v2:')
    .update(JSON.stringify(input))
    .digest('hex');
}
