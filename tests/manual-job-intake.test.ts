import { describe, expect, it, vi } from 'vitest';
import type { JobIngestionService } from '../src/modules/jobs/job-ingestion.service.js';
import { ManualJobIntakeService } from '../src/modules/jobs/manual-job-intake.service.js';
import type { JobMatchingService } from '../src/modules/matching/job-matching.service.js';

describe('ManualJobIntakeService', () => {
  it('preserva hint explícito de LinkedIn Easy Apply e executa matching', async () => {
    const ingest = vi.fn<JobIngestionService['ingest']>().mockResolvedValue({
      job: { id: 'job-1' } as Awaited<ReturnType<JobIngestionService['ingest']>>['job'],
      inserted: true,
      duplicated: false,
    });
    const analyze = vi.fn().mockResolvedValue({
      match: { decision: 'REVIEW', score: 78 },
      application: null,
      cached: false,
    });

    const service = new ManualJobIntakeService(
      { ingest } as unknown as JobIngestionService,
      { analyze } as unknown as JobMatchingService,
    );

    const result = await service.importAndAnalyze({
      title: 'Technical Support Analyst',
      company: 'Example',
      description: 'Windows networking support',
      applicationUrl: 'https://www.linkedin.com/jobs/view/123',
      remoteType: 'REMOTE',
      requiredCertifications: [],
      skills: [{ skill: 'Windows', required: true }],
      fastApply: true,
    });

    expect(result.channel).toEqual({
      platform: 'LINKEDIN',
      flow: 'FAST_APPLY',
      label: 'LinkedIn Easy Apply',
    });
    expect(ingest).toHaveBeenCalledOnce();
    const [, raw] = ingest.mock.calls[0] as unknown as [
      unknown,
      { source: string; rawData: Record<string, unknown> },
    ];
    expect(raw.source).toBe('manual');
    expect(raw.rawData).toMatchObject({
      manualImport: true,
      fastApply: true,
    });
    expect(analyze).toHaveBeenCalledWith('job-1');
  });

  it('classifica URL de ATS sem assumir fast apply', async () => {
    const ingest = vi.fn().mockResolvedValue({
      job: { id: 'job-2' },
      inserted: false,
      duplicated: true,
    });
    const analyze = vi.fn().mockResolvedValue({ match: { decision: 'SKIP' }, application: null });

    const result = await new ManualJobIntakeService(
      { ingest } as unknown as JobIngestionService,
      { analyze } as unknown as JobMatchingService,
    ).importAndAnalyze({
      title: 'Backend Developer',
      company: 'Example',
      description: 'Node.js APIs',
      applicationUrl: 'https://jobs.lever.co/example/abc',
      remoteType: 'REMOTE',
      requiredCertifications: [],
      skills: [],
      fastApply: false,
    });

    expect(result.channel).toMatchObject({ platform: 'LEVER', flow: 'ATS' });
    expect(result.duplicated).toBe(true);
  });
});
