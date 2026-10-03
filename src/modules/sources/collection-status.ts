import type { CollectionRunStatus } from '@prisma/client';

export function resolveCollectionStatus(errorCount: number, fatal = false): CollectionRunStatus {
  if (fatal) return 'FAILED';
  return errorCount > 0 ? 'PARTIAL' : 'SUCCESS';
}
