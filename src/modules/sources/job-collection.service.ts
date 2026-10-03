import type {
  CollectionRun,
  JobSource as JobSourceRecord,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { JobSearchQuery } from '../../integrations/job-sources/job-source.interface.js';
import type { JobSourceRegistry } from '../../integrations/job-sources/job-source.registry.js';
import { normalizeSourceError } from '../../integrations/job-sources/shared/source-errors.js';
import { DomainEventBus } from '../../shared/domain-event-bus.js';
import { AppError } from '../../shared/http.js';
import type { AppLogger } from '../../shared/logger.js';
import { AuditService } from '../audit/audit.service.js';
import { JobIngestionService } from '../jobs/job-ingestion.service.js';
import { JobPreFilterService } from '../jobs/job-prefilter.service.js';
import { canAnalyze } from '../matching/analysis-budget.js';
import { AnalysisBudgetService } from '../matching/analysis-budget.service.js';
import type { JobMatchingService } from '../matching/job-matching.service.js';
import { resolveCollectionStatus } from './collection-status.js';

export class JobCollectionService {
  private readonly ingestion: JobIngestionService;
  private readonly preFilter = new JobPreFilterService();
  private readonly audit: AuditService;
  private readonly analysisBudget: AnalysisBudgetService;

  constructor(
    private readonly db: PrismaClient,
    private readonly registry: JobSourceRegistry,
    private readonly matching: JobMatchingService,
    private readonly config: Environment,
    private readonly logger: AppLogger,
    private readonly events = new DomainEventBus(),
  ) {
    this.ingestion = new JobIngestionService(db);
    this.audit = new AuditService(db);
    this.analysisBudget = new AnalysisBudgetService(db);
  }

  async schedule(sourceId?: string): Promise<string[]> {
    const runs = await this.createRuns(sourceId);
    setImmediate(() => {
      void this.executeRuns(runs).catch((error: unknown) => {
        this.logger.error({ err: error }, 'Falha inesperada em coleta agendada manualmente');
      });
    });
    return runs.map((run) => run.id);
  }

  async runEnabled(sourceId?: string): Promise<CollectionRun[]> {
    const runs = await this.createRuns(sourceId);
    return this.executeRuns(runs);
  }

  private async executeRuns(
    runs: Array<CollectionRun & { source: JobSourceRecord }>,
  ): Promise<CollectionRun[]> {
    const completed: CollectionRun[] = [];
    for (const run of runs) completed.push(await this.execute(run));
    return completed;
  }

  private async createRuns(sourceId?: string) {
    const profile = await this.db.candidateProfile.findFirst({
      orderBy: { createdAt: 'asc' },
      include: { searchProfile: true },
    });
    if (!profile?.searchProfile?.enabled) {
      throw new AppError('Configure e habilite um JobSearchProfile antes da coleta', 409);
    }
    const sources = await this.db.jobSource.findMany({
      where: { enabled: true, ...(sourceId ? { id: sourceId } : {}) },
      orderBy: { slug: 'asc' },
    });
    const available = sources.filter((source) => this.registry.getAdapter(source.slug));
    if (!available.length)
      throw new AppError('Nenhuma fonte habilitada possui adapter disponível', 409);
    return this.db.$transaction(
      available.map((source) =>
        this.db.collectionRun.create({
          data: {
            sourceId: source.id,
            candidateId: profile.id,
            status: 'RUNNING',
            metadata: { trigger: 'manual-or-scheduler' },
          },
          include: { source: true },
        }),
      ),
    );
  }

  private async execute(run: CollectionRun & { source: JobSourceRecord }): Promise<CollectionRun> {
    const started = Date.now();
    const source = run.source;
    const adapter = this.registry.getAdapter(source.slug);
    if (!adapter) return this.failRun(run, new Error(`Adapter não registrado: ${source.slug}`));
    if (source.cooldownUntil && source.cooldownUntil > new Date()) {
      return this.failRun(
        run,
        new Error(`Fonte em cooldown até ${source.cooldownUntil.toISOString()}`),
      );
    }

    const profile = await this.db.candidateProfile.findUniqueOrThrow({
      where: { id: run.candidateId ?? '' },
      include: { skills: true, preferences: true, searchProfile: true },
    });
    if (!profile.preferences || !profile.searchProfile) {
      return this.failRun(run, new Error('Perfil de busca ou preferências ausentes'));
    }
    const search = profile.searchProfile;
    const query: JobSearchQuery = {
      keywords: search.keywords,
      locations: search.locations,
      remoteTypes: search.remoteTypes,
      employmentTypes: search.employmentTypes,
      limit: search.maxJobsPerRun,
      ...(search.publishedWithinHours
        ? { publishedAfter: new Date(Date.now() - search.publishedWithinHours * 3_600_000) }
        : {}),
    };
    const counters = {
      queriesExecuted: 1,
      jobsFetched: 0,
      jobsInserted: 0,
      jobsDuplicated: 0,
      jobsRejected: 0,
      jobsAnalyzed: 0,
      applyCount: 0,
      reviewCount: 0,
      skipCount: 0,
      applicationsReady: 0,
      errorCount: 0,
    };

    try {
      this.logger.info({ collectionRunId: run.id, source: source.slug }, 'Coleta iniciada');
      const externalJobs = await adapter.searchJobs(query);
      counters.jobsFetched = externalJobs.length;
      const insertedIds: string[] = [];
      for (const externalJob of externalJobs) {
        try {
          const result = await this.ingestion.ingest(adapter, externalJob);
          if (result.inserted) {
            counters.jobsInserted += 1;
            insertedIds.push(result.job.id);
          } else {
            counters.jobsDuplicated += 1;
          }
        } catch (error) {
          counters.errorCount += 1;
          await this.recordError(run.id, source.slug, error, 'NORMALIZATION_ERROR');
        }
      }

      const jobs = await this.db.job.findMany({
        where: { id: { in: insertedIds } },
        include: { skills: true },
      });
      const passed: Array<{ id: string; preliminaryScore: number }> = [];
      for (const job of jobs) {
        const result = this.preFilter.evaluate(
          job,
          search,
          {
            skills: profile.skills.map((skill) => skill.name),
            seniorityLevels: profile.preferences.seniorityLevels,
            remoteAllowed: profile.preferences.remoteAllowed,
            hybridAllowed: profile.preferences.hybridAllowed,
            onsiteAllowed: profile.preferences.onsiteAllowed,
          },
          this.config.MAX_JOB_AGE_DAYS,
        );
        if (!result.passed) {
          counters.jobsRejected += 1;
          await this.db.job.update({
            where: { id: job.id },
            data: { status: 'REJECTED_BY_PREFILTER', preliminaryScore: result.preliminaryScore },
          });
          await this.audit.record('JOB_PREFILTER_REJECTED', 'Job', job.id, {
            collectionRunId: run.id,
            source: source.slug,
            reasons: result.reasons,
          });
        } else {
          passed.push({ id: job.id, preliminaryScore: result.preliminaryScore });
          await this.db.job.update({
            where: { id: job.id },
            data: { status: 'PREFILTERED', preliminaryScore: result.preliminaryScore },
          });
        }
      }

      const pendingJobs = await this.db.job.findMany({
        where: {
          status: 'PENDING_ANALYSIS',
          ...(insertedIds.length ? { id: { notIn: insertedIds } } : {}),
        },
        select: { id: true, preliminaryScore: true },
        orderBy: [{ preliminaryScore: 'desc' }, { collectedAt: 'asc' }],
        take: this.config.LLM_MAX_ANALYSES_PER_RUN,
      });
      passed.push(
        ...pendingJobs.map((job) => ({
          id: job.id,
          preliminaryScore: job.preliminaryScore ?? 0,
        })),
      );

      passed.sort((a, b) => b.preliminaryScore - a.preliminaryScore);
      const autoAnalyze = this.config.AUTO_ANALYZE_NEW_JOBS && this.config.ENABLE_AUTO_ANALYSIS;
      let runUsed = 0;
      for (const item of passed) {
        if (
          !canAnalyze({
            autoAnalyze,
            runUsed,
            dailyUsed: 0,
            maxPerRun: this.config.LLM_MAX_ANALYSES_PER_RUN,
            maxPerDay: 1,
          })
        ) {
          await this.db.job.update({
            where: { id: item.id },
            data: { status: 'PENDING_ANALYSIS' },
          });
          continue;
        }
        const budgetTimestamp = new Date();
        const reserved = await this.analysisBudget.reserveDaily(
          this.config.LLM_MAX_ANALYSES_PER_DAY,
          budgetTimestamp,
        );
        if (!reserved) {
          await this.db.job.update({
            where: { id: item.id },
            data: { status: 'PENDING_ANALYSIS' },
          });
          continue;
        }
        try {
          const result = await this.matching.analyze(item.id);
          counters.jobsAnalyzed += 1;
          if (!result.cached) {
            runUsed += 1;
          } else {
            await this.analysisBudget.releaseDaily(budgetTimestamp);
          }
          if (result.match.decision === 'APPLY') {
            counters.applyCount += 1;
            if (result.application?.status === 'READY') counters.applicationsReady += 1;
            await this.events.publish({ type: 'HIGH_MATCH_FOUND', match: result.match });
          } else if (result.match.decision === 'REVIEW') {
            counters.reviewCount += 1;
            await this.events.publish({ type: 'REVIEW_REQUIRED', match: result.match });
          } else counters.skipCount += 1;
        } catch (error) {
          counters.errorCount += 1;
          await this.db.job.update({ where: { id: item.id }, data: { status: 'ERROR' } });
          await this.recordError(run.id, source.slug, error, 'UNKNOWN');
        }
      }

      const status = resolveCollectionStatus(counters.errorCount);
      const finished = await this.db.collectionRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          ...counters,
          metadata: { durationMs: Date.now() - started, safeMode: this.config.SAFE_MODE },
        },
      });
      await this.db.jobSource.update({
        where: { id: source.id },
        data: {
          lastSuccessfulRunAt: new Date(),
          consecutiveFailures: 0,
          cooldownUntil: null,
        },
      });
      await this.audit.record('COLLECTION_COMPLETED', 'CollectionRun', run.id, {
        source: source.slug,
        status,
        durationMs: Date.now() - started,
      });
      this.logger.info(
        {
          collectionRunId: run.id,
          source: source.slug,
          durationMs: Date.now() - started,
          ...counters,
        },
        'Coleta concluída',
      );
      return finished;
    } catch (error) {
      return this.failRun(run, error, started);
    }
  }

  async resumePending(): Promise<number> {
    if (!(this.config.AUTO_ANALYZE_NEW_JOBS && this.config.ENABLE_AUTO_ANALYSIS)) return 0;
    const jobs = await this.db.job.findMany({
      where: { status: 'PENDING_ANALYSIS' },
      orderBy: [{ preliminaryScore: 'desc' }, { collectedAt: 'asc' }],
      take: this.config.LLM_MAX_ANALYSES_PER_RUN,
      select: { id: true },
    });
    let analyzed = 0;
    for (const job of jobs) {
      const budgetTimestamp = new Date();
      const reserved = await this.analysisBudget.reserveDaily(
        this.config.LLM_MAX_ANALYSES_PER_DAY,
        budgetTimestamp,
      );
      if (!reserved) break;
      try {
        const result = await this.matching.analyze(job.id);
        if (result.cached) await this.analysisBudget.releaseDaily(budgetTimestamp);
        analyzed += 1;
        if (result.match.decision === 'APPLY') {
          await this.events.publish({ type: 'HIGH_MATCH_FOUND', match: result.match });
        } else if (result.match.decision === 'REVIEW') {
          await this.events.publish({ type: 'REVIEW_REQUIRED', match: result.match });
        }
      } catch (error) {
        await this.db.job.update({ where: { id: job.id }, data: { status: 'ERROR' } });
        this.logger.error({ err: error, jobId: job.id }, 'Falha ao retomar análise pendente');
      }
    }
    return analyzed;
  }

  private async failRun(
    run: CollectionRun & { source: JobSourceRecord },
    error: unknown,
    started = Date.now(),
  ): Promise<CollectionRun> {
    const normalized = normalizeSourceError(error);
    await this.recordError(run.id, run.source.slug, normalized, normalized.errorType);
    const failures = run.source.consecutiveFailures + 1;
    const cooldownUntil =
      failures >= this.config.SOURCE_FAILURE_THRESHOLD
        ? new Date(Date.now() + this.config.SOURCE_COOLDOWN_MINUTES * 60_000)
        : null;
    const [finished] = await this.db.$transaction([
      this.db.collectionRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorCount: { increment: 1 },
          metadata: { durationMs: Date.now() - started },
        },
      }),
      this.db.jobSource.update({
        where: { id: run.source.id },
        data: {
          lastFailedRunAt: new Date(),
          consecutiveFailures: failures,
          cooldownUntil,
        },
      }),
    ]);
    await this.audit.record('SOURCE_FAILED', 'JobSource', run.source.id, {
      collectionRunId: run.id,
      source: run.source.slug,
      errorType: normalized.errorType,
      message: normalized.message,
    });
    await this.events.publish({
      type: 'SOURCE_FAILED',
      source: run.source.slug,
      message: normalized.message,
    });
    this.logger.error(
      { collectionRunId: run.id, source: run.source.slug, err: normalized },
      'Coleta falhou',
    );
    return finished;
  }

  private async recordError(
    collectionRunId: string,
    source: string,
    error: unknown,
    fallbackType: Prisma.CollectionErrorCreateInput['errorType'],
  ): Promise<void> {
    const normalized = normalizeSourceError(error);
    await this.db.collectionError.create({
      data: {
        collectionRunId,
        source,
        errorType: normalized.errorType === 'NETWORK_ERROR' ? fallbackType : normalized.errorType,
        message: normalized.message.slice(0, 1000),
        httpStatus: normalized.httpStatus,
        retryable: normalized.retryable,
        metadata: {},
      },
    });
  }
}
