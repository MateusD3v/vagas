import type { ApplicationStatus, MatchDecision, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';

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
}
