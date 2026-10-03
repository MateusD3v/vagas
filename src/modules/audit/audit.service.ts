import type { Prisma, PrismaClient } from '@prisma/client';

export type AuditEvent =
  | 'JOB_DISCOVERED'
  | 'JOB_DUPLICATED'
  | 'JOB_ANALYZED'
  | 'APPLICATION_CREATED'
  | 'APPLICATION_READY'
  | 'APPLICATION_UPDATED'
  | 'APPLICATION_REMOVED_AFTER_REMATCH'
  | 'APPLICATION_PREPARATION_READY'
  | 'APPLICATION_STATUS_CHANGED'
  | 'APPLICATION_SUBMITTED'
  | 'CANDIDATE_ANSWER_UPSERTED'
  | 'CANDIDATE_ANSWER_DELETED'
  | 'APPLICATION_FAILED'
  | 'LLM_ERROR'
  | 'JOB_PREFILTER_REJECTED'
  | 'JOB_SOURCE_STATUS_CLOSED'
  | 'SOURCE_FAILED'
  | 'COLLECTION_COMPLETED';

export class AuditService {
  constructor(private readonly db: PrismaClient) {}

  async record(
    event: AuditEvent,
    entityType: string,
    entityId: string | null,
    metadata: Prisma.InputJsonValue = {},
  ): Promise<void> {
    await this.db.auditLog.create({ data: { event, entityType, entityId, metadata } });
  }
}
