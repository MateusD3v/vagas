import type { ApplicationStatus, MatchDecision, PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/http.js';
import { AuditService } from '../audit/audit.service.js';

const allowedStatusTransitions: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  READY: ['SUBMITTED', 'WITHDRAWN'],
  REVIEW_REQUIRED: ['READY', 'WITHDRAWN'],
  SUBMITTED: ['INTERVIEW', 'REJECTED', 'FAILED', 'WITHDRAWN'],
  FAILED: ['READY', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['ACCEPTED', 'WITHDRAWN'],
};

export interface ApplicationStatusUpdate {
  status: ApplicationStatus;
  externalApplicationId?: string | null;
  notes?: string | null;
}

export class ApplicationService {
  private readonly audit: AuditService;

  constructor(private readonly db: PrismaClient) {
    this.audit = new AuditService(db);
  }

  async prepare(candidateId: string, jobId: string, decision: MatchDecision, score: number) {
    const existing = await this.db.application.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    });
    const protectedStatuses = new Set<ApplicationStatus>([
      'SUBMITTED',
      'REJECTED',
      'INTERVIEW',
      'OFFER',
      'ACCEPTED',
      'WITHDRAWN',
    ]);

    if (decision === 'SKIP') {
      if (!existing) return null;
      if (protectedStatuses.has(existing.status)) return existing;
      await this.db.application.delete({ where: { id: existing.id } });
      await this.audit.record('APPLICATION_REMOVED_AFTER_REMATCH', 'Application', existing.id, {
        jobId,
        score,
      });
      return null;
    }

    const status: ApplicationStatus = decision === 'APPLY' ? 'READY' : 'REVIEW_REQUIRED';
    if (existing) {
      const updated = await this.db.application.update({
        where: { id: existing.id },
        data: {
          matchScore: score,
          ...(protectedStatuses.has(existing.status) ? {} : { status }),
        },
      });
      await this.audit.record('APPLICATION_UPDATED', 'Application', existing.id, {
        jobId,
        status: updated.status,
        score,
      });
      return updated;
    }

    const application = await this.db.application.create({
      data: {
        candidateId,
        jobId,
        status,
        matchScore: score,
        notes: 'Preparada localmente; nenhuma submissão externa foi realizada.',
      },
    });
    await this.audit.record('APPLICATION_CREATED', 'Application', application.id, {
      jobId,
      status,
      score,
    });
    if (status === 'READY') {
      await this.audit.record('APPLICATION_READY', 'Application', application.id, { jobId, score });
    }
    return application;
  }

  async updateStatus(applicationId: string, input: ApplicationStatusUpdate) {
    const application = await this.db.application.findUnique({ where: { id: applicationId } });
    if (!application) throw new AppError('Candidatura não encontrada', 404);
    if (application.status === input.status) return application;

    const allowed = allowedStatusTransitions[application.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new AppError(
        `Transição de ${application.status} para ${input.status} não é permitida`,
        409,
      );
    }

    const occurredAt = new Date();
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: input.status,
          ...(input.externalApplicationId !== undefined
            ? { externalApplicationId: input.externalApplicationId }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.status === 'SUBMITTED'
            ? {
                submittedAt: occurredAt,
                nextFollowUpAt: new Date(occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
              }
            : {}),
          ...(['REJECTED', 'OFFER', 'ACCEPTED', 'WITHDRAWN'].includes(input.status)
            ? { nextFollowUpAt: null, followUpNotifiedAt: null }
            : {}),
        },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId,
          fromStatus: application.status,
          toStatus: input.status,
          source: 'MANUAL',
          notes: input.notes ?? null,
          externalApplicationId: input.externalApplicationId ?? null,
          occurredAt,
        },
      });
      return result;
    });

    await this.audit.record('APPLICATION_STATUS_CHANGED', 'Application', applicationId, {
      from: application.status,
      to: input.status,
      externalApplicationId: input.externalApplicationId ?? null,
    });
    return updated;
  }
}
