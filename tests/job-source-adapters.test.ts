import { describe, expect, it } from 'vitest';
import { ArbeitnowJobSource } from '../src/integrations/job-sources/providers/arbeitnow/arbeitnow.adapter.js';
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
});
