import { describe, expect, it, vi } from 'vitest';
import type { JobIngestionService } from '../src/modules/jobs/job-ingestion.service.js';
import { ManualJobIntakeService } from '../src/modules/jobs/manual-job-intake.service.js';
import type { JobMatchingService } from '../src/modules/matching/job-matching.service.js';
import { manualJobImportSchema } from '../src/modules/jobs/job.schemas.js';
import { readApplicationQuestions } from '../src/modules/applications/application-channel.js';

describe('ManualJobIntakeService', () => {
  it('preserva opções numéricas e textuais após validar e importar o formulário público', async () => {
    const ingest = vi.fn<JobIngestionService['ingest']>().mockResolvedValue({
      job: { id: 'job-select' } as Awaited<ReturnType<JobIngestionService['ingest']>>['job'],
      inserted: true,
      duplicated: false,
    });
    const analyze = vi.fn().mockResolvedValue({ application: null });
    const questions = [
      {
        label: 'Disponibilidade',
        required: true,
        fields: [
          {
            name: 'availability',
            type: 'select',
            values: [
              { label: 'Imediata', value: 0 },
              { label: 'Em 30 dias', value: '30-days' },
              { label: 'A combinar' },
            ],
          },
        ],
      },
    ];
    const input = manualJobImportSchema.parse({
      title: 'Analista de Suporte',
      company: 'Example',
      description: 'Suporte Windows',
      applicationUrl: 'https://boards.greenhouse.io/example/jobs/123',
      applicationQuestions: questions,
    });
    await new ManualJobIntakeService(
      { ingest } as unknown as JobIngestionService,
      { analyze } as unknown as JobMatchingService,
    ).importAndAnalyze(input);
    const imported = ingest.mock.calls[0]?.[1] as { rawData: unknown };
    expect(readApplicationQuestions(imported.rawData)).toEqual(questions);
    expect(
      manualJobImportSchema.safeParse({
        ...input,
        applicationQuestions: [
          {
            ...questions[0],
            fields: [
              {
                type: 'select',
                values: [{ label: 'Inválida', value: { arbitrary: true } }],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

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
      applicationQuestions: [
        {
          label: 'Why do you want to work here?',
          required: true,
          fields: [{ name: 'question_123', type: 'textarea' }],
        },
      ],
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
      applicationQuestions: [
        {
          label: 'Why do you want to work here?',
          required: true,
        },
      ],
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
      title: 'Junior Backend Developer',
      company: 'Example',
      description: 'Node.js APIs',
      applicationUrl: 'https://jobs.lever.co/example/abc',
      remoteType: 'REMOTE',
      requiredCertifications: [],
      skills: [],
      fastApply: false,
      applicationQuestions: [],
    });

    expect(result.channel).toMatchObject({ platform: 'LEVER', flow: 'ATS' });
    expect(result.duplicated).toBe(true);
    const [, raw] = ingest.mock.calls[0] as unknown as [
      unknown,
      { seniority?: string; skills: Array<{ skill: string }> },
    ];
    expect(raw.seniority).toBe('JUNIOR');
    expect(raw.skills.map((skill) => skill.skill)).toContain('Node.js');
  });
});

describe('ManualJobIntakeService preparação imediata', () => {
  it('gera pacote imediatamente quando o matching cria candidatura', async () => {
    const ingest = vi.fn<JobIngestionService['ingest']>().mockResolvedValue({
      job: { id: 'job-3' } as Awaited<ReturnType<JobIngestionService['ingest']>>['job'],
      inserted: true,
      duplicated: false,
    });
    const analyze = vi.fn().mockResolvedValue({
      match: { decision: 'APPLY', score: 91 },
      application: { id: 'app-3', status: 'READY' },
      cached: false,
    });
    const prepare = vi.fn().mockResolvedValue({
      id: 'prep-3',
      applicationId: 'app-3',
      version: 2,
      missingInformation: [],
    });

    const result = await new ManualJobIntakeService(
      { ingest } as unknown as JobIngestionService,
      { analyze } as unknown as JobMatchingService,
      { prepare } as never,
    ).importAndAnalyze({
      title: 'Junior Backend Developer',
      company: 'Example',
      description: 'Node.js REST API Docker',
      applicationUrl: 'https://www.linkedin.com/jobs/view/456',
      remoteType: 'REMOTE',
      requiredCertifications: [],
      skills: [],
      fastApply: true,
      applicationQuestions: [],
    });

    expect(prepare).toHaveBeenCalledWith('app-3');
    expect(result.preparation).toMatchObject({
      applicationId: 'app-3',
      version: 2,
    });
  });
});
