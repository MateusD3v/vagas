import { describe, expect, it, vi } from 'vitest';
import type { JobSourceHttpClient } from '../src/integrations/job-sources/shared/http-client.js';
import { AtsJobResolverService } from '../src/modules/jobs/ats-job-resolver.service.js';

describe('AtsJobResolverService', () => {
  it('não tenta extrair LinkedIn e informa campos manuais necessários', async () => {
    const getJson = vi.fn();
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://www.linkedin.com/jobs/view/123');

    expect(result).toMatchObject({
      supported: false,
      platform: 'LINKEDIN',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getJson).not.toHaveBeenCalled();
  });

  it('carrega posting público do Lever sem inventar empresa', async () => {
    const getJson = vi.fn().mockResolvedValue({
      id: 'posting-1',
      text: 'Junior Backend Engineer',
      descriptionPlain: 'Node.js APIs and Docker',
      hostedUrl: 'https://jobs.lever.co/acme/posting-1',
      applyUrl: 'https://jobs.lever.co/acme/posting-1/apply',
      workplaceType: 'remote',
      categories: {
        location: 'Remote - Brazil',
        commitment: 'Full-time',
        team: 'Engineering',
      },
    });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://jobs.lever.co/acme/posting-1');

    expect(result.supported).toBe(true);
    expect(result.platform).toBe('LEVER');
    expect(result.data).toMatchObject({
      externalId: 'posting-1',
      title: 'Junior Backend Engineer',
      description: 'Node.js APIs and Docker',
      remoteType: 'REMOTE',
      employmentType: 'Full-time',
      applicationUrl: 'https://jobs.lever.co/acme/posting-1/apply',
    });
    expect(result.data?.company).toBeUndefined();
    expect(result.missingFields).toEqual(['company']);
    expect(String(getJson.mock.calls[0]?.[0])).toContain('api.lever.co/v0/postings/acme/posting-1');
  });

  it('carrega vaga e nome da empresa pelo Job Board API público do Greenhouse', async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({
        id: 456,
        title: 'Technical Support Analyst',
        content: '<p>Windows, redes e troubleshooting.</p>',
        absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/456',
        location: { name: 'Remote' },
        updated_at: '2026-10-03T12:00:00Z',
      })
      .mockResolvedValueOnce({ name: 'Acme Tecnologia' });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://job-boards.greenhouse.io/acme/jobs/456');

    expect(result).toMatchObject({
      supported: true,
      platform: 'GREENHOUSE',
      flow: 'ATS',
      missingFields: [],
      data: {
        externalId: '456',
        title: 'Technical Support Analyst',
        company: 'Acme Tecnologia',
        description: 'Windows, redes e troubleshooting.',
        remoteType: 'REMOTE',
      },
    });
    expect(getJson).toHaveBeenCalledTimes(2);
  });
});
