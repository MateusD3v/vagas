import { describe, expect, it, vi } from 'vitest';
import { ArbeitnowJobSource } from '../src/integrations/job-sources/providers/arbeitnow/arbeitnow.adapter.js';
import { JobicyJobSource } from '../src/integrations/job-sources/providers/jobicy/jobicy.adapter.js';
import { RemotiveJobSource } from '../src/integrations/job-sources/providers/remotive/remotive.adapter.js';
import type { JobSourceHttpClient } from '../src/integrations/job-sources/shared/http-client.js';

const unusedHttp = {} as JobSourceHttpClient;

describe('normalização dos adapters reais', () => {
  it('normaliza uma vaga Remotive sem preservar HTML', () => {
    const adapter = new RemotiveJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob({
      id: 42,
      url: 'https://remotive.com/jobs/42',
      title: 'Junior Node.js Developer',
      company_name: 'Example Inc',
      category: 'Software Development',
      job_type: 'full_time',
      publication_date: '2026-10-01T10:00:00Z',
      candidate_required_location: 'Worldwide',
      salary: '',
      description: '<p>Build REST API with <strong>Node.js</strong> and PostgreSQL.</p>',
    });
    expect(job.source).toBe('remotive');
    expect(job.remoteType).toBe('REMOTE');
    expect(job.description).not.toContain('<p>');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Node.js', 'PostgreSQL', 'REST API']),
    );
  });

  it('normaliza uma vaga Arbeitnow e infere senioridade', () => {
    const adapter = new ArbeitnowJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob({
      slug: 'backend-junior-1',
      company_name: 'Example GmbH',
      title: 'Backend Developer Junior',
      description: '<div>Java, Git and Docker</div>',
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/backend-junior-1',
      tags: ['Java'],
      job_types: ['full_time'],
      location: 'Berlin',
      created_at: 1_759_276_800,
    });
    expect(job.source).toBe('arbeitnow');
    expect(job.seniority).toBe('JUNIOR');
    expect(job.employmentType).toBe('FULL_TIME');
    expect(job.publishedAt).toBeInstanceOf(Date);
  });

  it('pagina a Arbeitnow até encontrar vagas compatíveis com as keywords', async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            slug: 'designer-1',
            company_name: 'Example GmbH',
            title: 'Product Designer',
            description: 'Design systems',
            remote: true,
            url: 'https://www.arbeitnow.com/jobs/designer-1',
            tags: ['Design'],
            job_types: ['full_time'],
            location: 'Remote',
            created_at: 1_759_276_800,
          },
        ],
        links: { next: 'https://www.arbeitnow.com/api/job-board-api?page=2' },
      })
      .mockResolvedValueOnce({
        data: [
          {
            slug: 'node-1',
            company_name: 'Example GmbH',
            title: 'Junior Node.js Developer',
            description: 'Node.js backend APIs',
            remote: true,
            url: 'https://www.arbeitnow.com/jobs/node-1',
            tags: ['Node.js'],
            job_types: ['full_time'],
            location: 'Remote',
            created_at: 1_759_276_801,
          },
        ],
        links: { next: null },
      });
    const adapter = new ArbeitnowJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const jobs = await adapter.searchJobs({
      keywords: ['Node.js'],
      locations: [],
      remoteTypes: [],
      employmentTypes: [],
      limit: 1,
    });

    expect(jobs.map((job) => job.slug)).toEqual(['node-1']);
    expect(getJson).toHaveBeenCalledTimes(2);
  });
});

describe('Jobicy adapter', () => {
  it('normaliza uma vaga pública e preserva a URL da Jobicy', () => {
    const adapter = new JobicyJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob({
      id: 123456,
      url: 'https://jobicy.com/jobs/example-role',
      jobTitle: 'Backend Developer',
      companyName: 'Example Company',
      companyLogo: 'https://example.com/logo.png',
      jobIndustry: ['Engineering'],
      jobType: ['Full-Time'],
      jobGeo: 'Anywhere',
      jobLevel: 'Midweight',
      jobExcerpt: 'Backend APIs',
      jobDescription: '<p>Node.js, Git and Docker.</p>',
      pubDate: '2026-10-03T08:12:42+00:00',
      salaryMin: 40000,
      salaryMax: 60000,
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
    });

    expect(job.source).toBe('jobicy');
    expect(job.externalId).toBe('123456');
    expect(job.remoteType).toBe('REMOTE');
    expect(job.employmentType).toBe('FULL_TIME');
    expect(job.seniority).toBe('MID');
    expect(job.applicationUrl).toBe('https://jobicy.com/jobs/example-role');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Node.js', 'Git', 'Docker']),
    );
  });

  it('usa cursor de paginação mantendo a keyword', async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        nextCursor: 'cursor-2',
        hasMore: true,
        jobs: [
          {
            id: 1,
            url: 'https://jobicy.com/jobs/1',
            jobTitle: 'Node.js Developer',
            companyName: 'Company A',
            companyLogo: null,
            jobIndustry: ['Engineering'],
            jobType: ['Full-Time'],
            jobGeo: 'Anywhere',
            jobLevel: 'Junior',
            jobExcerpt: null,
            jobDescription: 'Node.js',
            pubDate: '2026-10-03T08:00:00+00:00',
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: null,
            salaryPeriod: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        nextCursor: null,
        hasMore: false,
        jobs: [
          {
            id: 2,
            url: 'https://jobicy.com/jobs/2',
            jobTitle: 'Backend Developer',
            companyName: 'Company B',
            companyLogo: null,
            jobIndustry: ['Engineering'],
            jobType: ['Full-Time'],
            jobGeo: 'Anywhere',
            jobLevel: 'Junior',
            jobExcerpt: null,
            jobDescription: 'REST API',
            pubDate: '2026-10-03T07:00:00+00:00',
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: null,
            salaryPeriod: null,
          },
        ],
      });
    const adapter = new JobicyJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const jobs = await adapter.searchJobs({
      keywords: ['Node.js'],
      locations: [],
      remoteTypes: [],
      employmentTypes: [],
      limit: 2,
    });

    expect(jobs.map((job) => job.id)).toEqual([1, 2]);
    expect(getJson).toHaveBeenCalledTimes(2);
    expect(String(getJson.mock.calls[0]?.[0])).toContain('tag=Node.js');
    expect(String(getJson.mock.calls[1]?.[0])).toContain('cursor=cursor-2');
    expect(String(getJson.mock.calls[1]?.[0])).toContain('tag=Node.js');
  });

  it('consulta status explícito em lotes e normaliza active/closed/unknown', async () => {
    const getJson = vi.fn().mockResolvedValue({
      success: true,
      jobs: [
        { id: 10, status: 'active' },
        { id: 11, status: 'closed' },
        { id: 12, status: 'unknown' },
      ],
    });
    const adapter = new JobicyJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const result = await adapter.checkJobStatuses?.(['10', '11', '12', 'invalid']);

    expect(result).toEqual([
      { externalId: '10', status: 'ACTIVE' },
      { externalId: '11', status: 'CLOSED' },
      { externalId: '12', status: 'UNKNOWN' },
    ]);
    expect(getJson).toHaveBeenCalledOnce();
    expect(String(getJson.mock.calls[0]?.[0])).toContain('ids=10%2C11%2C12');
  });
});
