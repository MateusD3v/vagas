import type { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../shared/http.js';
import { includesText } from '../../shared/text.js';

export interface ApplicationEligibility {
  applicationId: string;
  policyEligible: boolean;
  automaticSubmissionAllowed: boolean;
  safeMode: boolean;
  submittedToday: number;
  reasons: string[];
  automationBlockers: string[];
}

function utcStartOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class ApplicationEligibilityService {
  constructor(
    private readonly db: PrismaClient | Prisma.TransactionClient,
    private readonly safeMode: boolean,
    private readonly hasSubmissionProvider: (
      source: string,
      applicationUrl: string | null,
    ) => boolean = () => false,
    private readonly providerReadiness?: (
      applicationId: string,
      source: string,
      url: string | null,
    ) => Promise<string[]>,
  ) {}

  async evaluate(applicationId: string, now = new Date()): Promise<ApplicationEligibility> {
    const application = await this.db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { include: { matches: true } },
        preparation: true,
        submissionAttempt: true,
        candidate: { include: { policy: true } },
      },
    });
    if (!application) throw new AppError('Candidatura não encontrada', 404);

    const policy = application.candidate.policy;
    const reasons: string[] = [];
    const automationBlockers: string[] = [];

    if (application.candidate.isDemo)
      reasons.push('Perfil de demonstração não pode enviar candidaturas');
    if (!application.job.isActive || application.job.status !== 'ANALYZED')
      reasons.push('Vaga inativa ou sem confirmação recente de disponibilidade');
    const match = application.job.matches.find(
      (item) => item.candidateId === application.candidateId,
    );
    if (!match || match.decision === 'SKIP' || match.hardConstraints.length)
      reasons.push('Matching ausente ou com restrições obrigatórias');
    if (application.submissionAttempt)
      automationBlockers.push(
        'Já existe uma tentativa reservada; verifique o resultado antes de qualquer nova ação',
      );

    if (application.status !== 'READY') {
      reasons.push(`Candidatura não está READY: ${application.status}`);
    }
    if (!policy) {
      reasons.push('ApplicationPolicy não configurada');
    } else {
      if (!policy.autoApplyEnabled) reasons.push('Auto-apply desabilitado pela política');
      if (application.matchScore < policy.minimumScore) {
        reasons.push(
          `Score abaixo do mínimo da política: ${application.matchScore}/${policy.minimumScore}`,
        );
      }
      if (policy.allowedSources.length && !policy.allowedSources.includes(application.job.source)) {
        reasons.push(`Fonte não permitida pela política: ${application.job.source}`);
      }
      if (
        policy.blockedCompanies.some((company) => includesText(application.job.company, company))
      ) {
        reasons.push(`Empresa bloqueada pela política: ${application.job.company}`);
      }
      const jobText = `${application.job.title} ${application.job.description}`;
      const blockedKeyword = policy.blockedKeywords.find((keyword) =>
        includesText(jobText, keyword),
      );
      if (blockedKeyword) reasons.push(`Palavra-chave bloqueada pela política: ${blockedKeyword}`);
      if (
        policy.requireSalaryInformation &&
        application.job.salaryMin === null &&
        application.job.salaryMax === null
      ) {
        reasons.push('Política exige informação salarial');
      }
      if (policy.requireRemote && application.job.remoteType !== 'REMOTE') {
        reasons.push('Política exige vaga remota');
      }
    }

    if (!application.preparation) {
      reasons.push('Pacote de preparação ainda não foi gerado');
    } else if (application.preparation.missingInformation.length) {
      reasons.push(
        `Pacote possui informações pendentes: ${application.preparation.missingInformation.join('; ')}`,
      );
    }

    const submittedToday = await this.db.application.count({
      where: {
        candidateId: application.candidateId,
        submittedAt: { gte: utcStartOfDay(now) },
      },
    });
    if (policy && submittedToday >= policy.maximumApplicationsPerDay) {
      reasons.push(`Limite diário atingido: ${submittedToday}/${policy.maximumApplicationsPerDay}`);
    }

    const policyEligible = reasons.length === 0;
    if (this.providerReadiness)
      automationBlockers.push(
        ...(await this.providerReadiness(
          applicationId,
          application.job.source,
          application.job.applicationUrl,
        )),
      );
    if (this.safeMode) automationBlockers.push('SAFE_MODE está ativo');
    if (!this.hasSubmissionProvider(application.job.source, application.job.applicationUrl)) {
      automationBlockers.push('Nenhum provider de submissão externa autorizado foi configurado');
    }

    return {
      applicationId,
      policyEligible,
      automaticSubmissionAllowed: policyEligible && automationBlockers.length === 0,
      safeMode: this.safeMode,
      submittedToday,
      reasons,
      automationBlockers,
    };
  }
}
