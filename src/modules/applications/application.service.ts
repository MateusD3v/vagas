import type { MatchDecision, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';

export class ApplicationService {
  private readonly audit: AuditService;

  constructor(private readonly db: PrismaClient) {
    this.audit = new AuditService(db);
  }

  async prepare(candidateId: string, jobId: string, decision: MatchDecision, score: number) {
    if (decision === 'SKIP') return null;
    const status = decision === 'APPLY' ? 'READY' : 'REVIEW_REQUIRED';
    const existing = await this.db.application.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    });
    if (existing) return existing;

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
