import type { PrismaClient } from '@prisma/client';
import type { SubmissionProviderRegistry } from '../../integrations/submission/submission.registry.js';
import { AppError } from '../../shared/http.js';
import { AuditService } from '../audit/audit.service.js';
import { ApplicationEligibilityService } from './application-eligibility.service.js';

export class ApplicationSubmissionService {
  private readonly audit: AuditService;
  private readonly eligibility: ApplicationEligibilityService;

  constructor(
    private readonly db: PrismaClient,
    private readonly safeMode: boolean,
    private readonly registry: SubmissionProviderRegistry,
  ) {
    this.audit = new AuditService(db);
    this.eligibility = new ApplicationEligibilityService(db, safeMode, (source, applicationUrl) =>
      Boolean(registry.find(source, applicationUrl)),
    );
  }

  async submit(applicationId: string) {
    const eligibility = await this.eligibility.evaluate(applicationId);
    if (!eligibility.automaticSubmissionAllowed) {
      throw new AppError('Candidatura não elegível para submissão automática', 409, eligibility);
    }

    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: { job: true, preparation: true },
    });
    if (!application) throw new AppError('Candidatura não encontrada', 404);
    if (!application.preparation) {
      throw new AppError('Pacote de preparação não encontrado', 409);
    }

    const provider = this.registry.find(application.job.source, application.job.applicationUrl);
    if (!provider) {
      throw new AppError('Nenhum provider autorizado suporta esta vaga', 409);
    }

    const result = await provider.submit({
      applicationId,
      source: application.job.source,
      applicationUrl: application.job.applicationUrl,
      preparation: {
        payload: application.preparation.payload,
        reusableAnswers: application.preparation.reusableAnswers,
      },
    });

    const updated = await this.db.application.update({
      where: { id: applicationId },
      data: {
        status: 'SUBMITTED',
        applicationMethod: `AUTOMATED:${provider.id}`,
        externalApplicationId: result.externalApplicationId,
        submittedAt: result.submittedAt,
      },
    });

    await this.audit.record('APPLICATION_SUBMITTED', 'Application', applicationId, {
      provider: provider.id,
      externalApplicationId: result.externalApplicationId,
      metadata: result.metadata ?? {},
    });
    return updated;
  }
}
