import type { PrismaClient } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../shared/http.js';
import { ApplicationService } from '../applications/application.service.js';
import { AnalysisBudgetService } from '../matching/analysis-budget.service.js';
import type { JobMatchingService } from '../matching/job-matching.service.js';
import { JobPreFilterService } from './job-prefilter.service.js';

export class JobReprocessService {
  private readonly preFilter = new JobPreFilterService();
  private readonly budget: AnalysisBudgetService;
  private readonly applications: ApplicationService;

  constructor(
    private readonly db: PrismaClient,
    private readonly matching: JobMatchingService,
    private readonly config: Environment,
  ) {
    this.budget = new AnalysisBudgetService(db);
    this.applications = new ApplicationService(db);
  }

  async run() {
    const profile = await this.db.candidateProfile.findFirst({
      orderBy: { createdAt: 'asc' },
      include: { skills: true, preferences: true, searchProfile: true },
    });
    if (!profile?.preferences || !profile.searchProfile) {
      throw new AppError('Perfil e configuração de busca são obrigatórios', 409);
    }
    if (profile.isDemo) {
      throw new AppError('Substitua o perfil de demonstração antes da reanálise', 409);
    }

    const jobs = await this.db.job.findMany({
      where: { isActive: true, source: { not: 'mock' } },
      include: { skills: true },
      orderBy: { collectedAt: 'desc' },
      take: 500,
    });
    const result = {
      scanned: jobs.length,
      rejected: 0,
      analyzed: 0,
      apply: 0,
      review: 0,
      skip: 0,
      pending: 0,
      errors: 0,
    };
    let runUsed = 0;

    for (const job of jobs) {
      const pre = this.preFilter.evaluate(
        job,
        profile.searchProfile,
        {
          skills: profile.skills.map((skill) => skill.name),
          seniorityLevels: profile.preferences.seniorityLevels,
          remoteAllowed: profile.preferences.remoteAllowed,
          hybridAllowed: profile.preferences.hybridAllowed,
          onsiteAllowed: profile.preferences.onsiteAllowed,
        },
        this.config.MAX_JOB_AGE_DAYS,
      );

      if (!pre.passed) {
        result.rejected += 1;
        await this.db.$transaction([
          this.db.job.update({
            where: { id: job.id },
            data: { status: 'REJECTED_BY_PREFILTER', preliminaryScore: pre.preliminaryScore },
          }),
          this.db.jobMatch.deleteMany({
            where: { jobId: job.id, candidateId: profile.id },
          }),
        ]);
        await this.applications.prepare(profile.id, job.id, 'SKIP', pre.preliminaryScore);
        continue;
      }

      await this.db.job.update({
        where: { id: job.id },
        data: { status: 'PREFILTERED', preliminaryScore: pre.preliminaryScore },
      });
      if (runUsed >= this.config.LLM_MAX_ANALYSES_PER_RUN) {
        result.pending += 1;
        await this.db.job.update({
          where: { id: job.id },
          data: { status: 'PENDING_ANALYSIS' },
        });
        continue;
      }

      const budgetTimestamp = new Date();
      const reserved = await this.budget.reserveDaily(
        this.config.LLM_MAX_ANALYSES_PER_DAY,
        budgetTimestamp,
      );
      if (!reserved) {
        result.pending += 1;
        await this.db.job.update({
          where: { id: job.id },
          data: { status: 'PENDING_ANALYSIS' },
        });
        continue;
      }

      try {
        const analyzed = await this.matching.analyze(job.id);
        result.analyzed += 1;
        if (analyzed.cached) await this.budget.releaseDaily(budgetTimestamp);
        else runUsed += 1;
        if (analyzed.match.decision === 'APPLY') result.apply += 1;
        else if (analyzed.match.decision === 'REVIEW') result.review += 1;
        else result.skip += 1;
      } catch {
        result.errors += 1;
        await this.db.job.update({
          where: { id: job.id },
          data: { status: 'ERROR' },
        });
      }
    }

    return result;
  }
}
