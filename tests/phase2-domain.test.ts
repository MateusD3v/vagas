import { describe, expect, it, vi } from 'vitest';
import { jobsQuerySchema } from '../src/modules/jobs/job.schemas.js';
import { createAnalysisInputHash } from '../src/modules/matching/analysis-cache.js';
import { canAnalyze } from '../src/modules/matching/analysis-budget.js';
import { resolveCollectionStatus } from '../src/modules/sources/collection-status.js';
import { CollectionScheduler } from '../src/workers/collection-scheduler.js';

describe('controles operacionais da Fase 2', () => {
  it('aceita todos os estados operacionais da Fase 2 no filtro de vagas', () => {
    expect(jobsQuerySchema.parse({ status: 'PENDING_ANALYSIS' }).status).toBe('PENDING_ANALYSIS');
    expect(jobsQuerySchema.parse({ status: 'REJECTED_BY_PREFILTER' }).status).toBe(
      'REJECTED_BY_PREFILTER',
    );
  });

  it('resolve estados SUCCESS, PARTIAL e FAILED', () => {
    expect(resolveCollectionStatus(0)).toBe('SUCCESS');
    expect(resolveCollectionStatus(1)).toBe('PARTIAL');
    expect(resolveCollectionStatus(0, true)).toBe('FAILED');
  });

  it('respeita auto análise desabilitada e limites diário/por execução', () => {
    const base = { autoAnalyze: true, runUsed: 0, dailyUsed: 0, maxPerRun: 2, maxPerDay: 3 };
    expect(canAnalyze(base)).toBe(true);
    expect(canAnalyze({ ...base, autoAnalyze: false })).toBe(false);
    expect(canAnalyze({ ...base, runUsed: 2 })).toBe(false);
    expect(canAnalyze({ ...base, dailyUsed: 3 })).toBe(false);
  });

  it('cache muda quando perfil, vaga ou versão muda', () => {
    const first = createAnalysisInputHash({ profile: { skills: ['Node.js'] }, job: 1, version: 1 });
    expect(createAnalysisInputHash({ profile: { skills: ['Node.js'] }, job: 1, version: 1 })).toBe(
      first,
    );
    expect(createAnalysisInputHash({ profile: { skills: ['Java'] }, job: 1, version: 1 })).not.toBe(
      first,
    );
    expect(
      createAnalysisInputHash({ profile: { skills: ['Node.js'] }, job: 1, version: 2 }),
    ).not.toBe(first);
  });

  it('scheduler chama o orchestrator', async () => {
    const runEnabled = vi.fn(async () => Promise.resolve([]));
    const resumePending = vi.fn(async () => Promise.resolve(0));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const scheduler = new CollectionScheduler('0 */6 * * *', { runEnabled, resumePending }, logger);
    await scheduler.runOnce();
    expect(runEnabled).toHaveBeenCalledOnce();
    expect(resumePending).toHaveBeenCalledOnce();
  });

  it('retoma análises pendentes mesmo quando a criação de coletas falha', async () => {
    const collectionError = new Error('fonte indisponível');
    const runEnabled = vi.fn(async () => Promise.reject(collectionError));
    const resumePending = vi.fn(async () => Promise.resolve(2));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const scheduler = new CollectionScheduler('0 */6 * * *', { runEnabled, resumePending }, logger);

    await expect(scheduler.runOnce()).rejects.toBe(collectionError);
    expect(resumePending).toHaveBeenCalledOnce();
  });
});
