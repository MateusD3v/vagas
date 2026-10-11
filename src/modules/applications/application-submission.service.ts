import { lockCandidateSubmissions } from './submission-lock.js';
import type { PrismaClient } from '@prisma/client';
import type { SubmissionProviderRegistry } from '../../integrations/submission/submission.registry.js';
import { AppError } from '../../shared/http.js';
import { EmailApplicationChannelService } from './email-application-channel.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ApplicationEligibilityService } from './application-eligibility.service.js';

export class ApplicationSubmissionService {
  private readonly audit: AuditService;
  constructor(
    private readonly db: PrismaClient,
    private readonly safeMode: boolean,
    private readonly registry: SubmissionProviderRegistry,
  ) {
    this.audit = new AuditService(db);
  }

  async submit(applicationId: string) {
    if (this.safeMode) throw new AppError('SAFE_MODE está ativo', 409);
    const existing = await this.db.application.findUnique({ where: { id: applicationId } });
    if (!existing) throw new AppError('Candidatura não encontrada', 404);
    if (existing.submittedAt || existing.externalApplicationId || existing.status === 'SUBMITTED')
      throw new AppError('Candidatura já foi submetida; envio duplicado bloqueado', 409);

    const { application, providerId } = await this.db.$transaction(async (tx) => {
      await lockCandidateSubmissions(tx, existing.candidateId);
      const registry = this.registry;
      const eligibility = await new ApplicationEligibilityService(
        tx,
        this.safeMode,
        (source, url) => Boolean(registry.find(source, url)),
        async (id, source, url) => registry.find(source, url)?.readiness?.(id) ?? [],
      ).evaluate(applicationId);
      if (!eligibility.automaticSubmissionAllowed)
        throw new AppError('Candidatura não elegível para submissão automática', 409, eligibility);
      const application = await tx.application.findUnique({
        where: { id: applicationId },
        include: {
          job: true,
          emailTarget: true,
          preparation: true,
          candidate: { include: { policy: true } },
        },
      });
      if (!application?.preparation || !application.candidate.policy)
        throw new AppError('Pacote ou política ausente', 409);
      if (application.submittedAt || application.externalApplicationId)
        throw new AppError('Candidatura já enviada', 409);
      const provider = registry.find(application.job.source, application.job.applicationUrl);
      if (!provider) throw new AppError('Nenhum provider autorizado suporta esta vaga', 409);
      // Same job announcement can arrive from different sources with different job IDs.
      // Guard Gmail submissions by exact verified evidence URL under the candidate row lock.
      if (provider.id === 'gmail' && application.emailTarget) {
        const duplicate = await tx.application.findFirst({
          where: {
            candidateId: application.candidateId,
            id: { not: applicationId },
            emailTarget: { is: { evidenceUrl: application.emailTarget.evidenceUrl } },
            OR: [
              { submittedAt: { not: null } },
              { submissionAttempt: { isNot: null } },
            ],
          },
          select: { id: true },
        });
        if (duplicate)
          throw new AppError('Outra candidatura para este anúncio já foi enviada ou reservada', 409);
      }
      const now = new Date();
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const [attempts, manual] = await Promise.all([
        tx.submissionAttempt.count({
          where: { candidateId: application.candidateId, reservedAt: { gte: day } },
        }),
        tx.application.count({
          where: {
            candidateId: application.candidateId,
            submittedAt: { gte: day },
            OR: [
              { submissionAttempt: { is: null } },
              { submissionAttempt: { reservedAt: { lt: day } } },
            ],
          },
        }),
      ]);
      if (attempts + manual >= application.candidate.policy.maximumApplicationsPerDay)
        throw new AppError('Limite diário de reservas e envios atingido', 409);
      // Unique applicationId survives errors and restarts. No external call occurs before commit.
      await tx.submissionAttempt.create({
        data: {
          applicationId,
          candidateId: application.candidateId,
          provider: provider.id,
          status: 'PENDING',
          reservedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          event: 'APPLICATION_SUBMISSION_RESERVED',
          entityType: 'Application',
          entityId: applicationId,
          metadata: { provider: provider.id },
        },
      });
      return { application, providerId: provider.id };
    });

    const provider = this.registry.find(application.job.source, application.job.applicationUrl)!;
    let result;
    try {
      result = await provider.submit({
        applicationId,
        source: application.job.source,
        applicationUrl: application.job.applicationUrl,
        preparation: {
          payload: application.preparation!.payload,
          reusableAnswers: application.preparation!.reusableAnswers,
        },
      });
    } catch {
      await this.db.submissionAttempt
        .update({ where: { applicationId }, data: { status: 'UNKNOWN', completedAt: new Date() } })
        .catch(() => undefined);
      await this.audit
        .record('APPLICATION_SUBMISSION_UNCONFIRMED', 'Application', applicationId, {
          provider: providerId,
        })
        .catch(() => undefined);
      throw new AppError(
        'Envio sem confirmação. Verifique o serviço e a pasta Enviados; repetição automática bloqueada.',
        502,
      );
    }

    // If persistence fails after an acknowledged send, PENDING still blocks duplicates.
    return this.db.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: 'SUBMITTED',
          applicationMethod: `AUTOMATED:${providerId}`,
          externalApplicationId: result.externalApplicationId,
          submittedAt: result.submittedAt,
          nextFollowUpAt: new Date(result.submittedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
          followUpNotifiedAt: null,
        },
      });
      await tx.submissionAttempt.update({
        where: { applicationId },
        data: {
          status: 'SENT',
          completedAt: new Date(),
          externalApplicationId: result.externalApplicationId,
        },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId,
          fromStatus: 'READY',
          toStatus: 'SUBMITTED',
          source: `AUTOMATED:${providerId}`,
          externalApplicationId: result.externalApplicationId,
          occurredAt: result.submittedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          event: 'APPLICATION_SUBMITTED',
          entityType: 'Application',
          entityId: applicationId,
          metadata: {
            provider: providerId,
            externalApplicationId: result.externalApplicationId,
            metadata: result.metadata ?? {},
          },
        },
      });
      return updated;
    });
  }

  async submitPending(limit = 25) {
    if (this.safeMode || this.registry.ids().length === 0)
      return { attempted: 0, submitted: 0, blocked: 0 };
    if (this.registry.ids().includes('gmail'))
      await new EmailApplicationChannelService(this.db).discoverPending(limit);
    const applications = await this.db.application.findMany({
      where: {
        status: 'READY',
        submissionAttempt: { is: null },
        submittedAt: null,
        emailTarget: { isNot: null },
        candidate: { isDemo: false, policy: { autoApplyEnabled: true } },
      },
      orderBy: [{ matchScore: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true },
    });
    let submitted = 0;
    let blocked = 0;
    for (const application of applications) {
      try {
        await this.submit(application.id);
        submitted++;
      } catch {
        blocked++;
      }
    }
    return { attempted: applications.length, submitted, blocked };
  }
}
