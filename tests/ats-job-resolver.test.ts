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
        location_questions: [
          {
            label: 'Location',
            required: true,
            fields: [{ name: 'location', type: 'input_text', values: [] }],
          },
        ],
        questions: [
          {
            label: 'Why do you want to work here?',
            required: true,
            fields: [{ name: 'question_123', type: 'textarea' }],
          },
          {
            label: 'Portfolio URL',
            required: false,
            fields: [
              {
                name: 'question_456',
                type: 'multi_value_single_select',
                values: [
                  { label: 'No', value: 0 },
                  { label: 'Yes', value: 1 },
                ],
              },
            ],
          },
        ],
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
      applicationQuestions: [
        {
          label: 'Location',
          required: true,
          fields: [{ name: 'location', type: 'input_text' }],
        },
        {
          label: 'Why do you want to work here?',
          required: true,
          fields: [{ name: 'question_123', type: 'textarea' }],
        },
        {
          label: 'Portfolio URL',
          required: false,
          fields: [
            {
              name: 'question_456',
              type: 'multi_value_single_select',
              values: [
                { label: 'No', value: 0 },
                { label: 'Yes', value: 1 },
              ],
            },
          ],
        },
      ],
    });
    expect(getJson).toHaveBeenCalledTimes(2);
    expect(String(getJson.mock.calls[0]?.[0])).toContain('questions=true');
  });
});

describe('AtsJobResolverService Ashby', () => {
  it('carrega vaga publicada usando o Job Postings API público da Ashby', async () => {
    const getJson = vi.fn().mockResolvedValue({
      apiVersion: '1',
      jobs: [
        {
          title: 'Technical Support Agent',
          location: 'Brazil',
          isRemote: true,
          workplaceType: 'Remote',
          descriptionPlain: 'Technical support and troubleshooting.',
          descriptionHtml: '<p>Technical support and troubleshooting.</p>',
          publishedAt: '2026-10-03T12:00:00Z',
          employmentType: 'FullTime',
          jobUrl: 'https://jobs.ashbyhq.com/acme/posting-1',
          applyUrl: 'https://jobs.ashbyhq.com/acme/posting-1/application',
        },
      ],
    });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://jobs.ashbyhq.com/acme/posting-1/');

    expect(result).toMatchObject({
      supported: true,
      platform: 'ASHBY',
      flow: 'ATS',
      missingFields: ['company'],
      data: {
        title: 'Technical Support Agent',
        description: 'Technical support and troubleshooting.',
        location: 'Brazil',
        remoteType: 'REMOTE',
        employmentType: 'FullTime',
        applicationUrl: 'https://jobs.ashbyhq.com/acme/posting-1/application',
      },
    });
    expect(String(getJson.mock.calls[0]?.[0])).toBe(
      'https://api.ashbyhq.com/posting-api/job-board/acme',
    );
  });

  it('não inventa dados quando a URL não corresponde a uma vaga publicada', async () => {
    const getJson = vi.fn().mockResolvedValue({ apiVersion: '1', jobs: [] });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://jobs.ashbyhq.com/acme/missing');

    expect(result).toMatchObject({
      supported: false,
      platform: 'ASHBY',
      missingFields: ['title', 'company', 'description'],
    });
  });
});

describe('AtsJobResolverService SmartRecruiters', () => {
  it('carrega posting público do SmartRecruiters sem autenticação de candidato', async () => {
    const getJson = vi.fn().mockResolvedValue({
      id: '884352026',
      uuid: '34225731-e7cf-4584-b0b7-78098fe1a66b',
      name: 'Junior Backend Developer',
      company: {
        name: 'Acme Tecnologia',
        identifier: 'acme',
      },
      location: {
        city: 'São Paulo',
        region: 'SP',
        country: 'br',
        remote: true,
      },
      typeOfEmployment: { label: 'Full-time' },
      experienceLevel: { label: 'Entry Level' },
      postingUrl: 'https://jobs.smartrecruiters.com/acme/884352026-junior-backend-developer',
      applyUrl: 'https://jobs.smartrecruiters.com/acme/884352026-junior-backend-developer?oga=true',
      releasedDate: '2026-10-03T12:00:00Z',
      jobAd: {
        sections: {
          jobDescription: {
            title: 'Job Description',
            text: '<p>Node.js APIs and Docker.</p>',
          },
          qualifications: {
            title: 'Qualifications',
            text: '<p>Git and REST.</p>',
          },
        },
      },
      active: true,
    });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve(
      'https://jobs.smartrecruiters.com/acme/884352026-junior-backend-developer',
    );

    expect(result).toMatchObject({
      supported: true,
      platform: 'SMARTRECRUITERS',
      flow: 'ATS',
      missingFields: [],
      data: {
        externalId: '34225731-e7cf-4584-b0b7-78098fe1a66b',
        title: 'Junior Backend Developer',
        company: 'Acme Tecnologia',
        description: 'Node.js APIs and Docker.\n\nGit and REST.',
        location: 'São Paulo, SP, br',
        remoteType: 'REMOTE',
        employmentType: 'Full-time',
      },
    });
    expect(String(getJson.mock.calls[0]?.[0])).toBe(
      'https://api.smartrecruiters.com/v1/companies/acme/postings/884352026',
    );
  });

  it('não tenta resolver URL SmartRecruiters sem posting id', async () => {
    const getJson = vi.fn();
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://jobs.smartrecruiters.com/acme');

    expect(result).toMatchObject({
      supported: false,
      platform: 'SMARTRECRUITERS',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getJson).not.toHaveBeenCalled();
  });
});

describe('AtsJobResolverService Recruitee', () => {
  it('carrega vaga publicada usando o feed público do Recruitee', async () => {
    const getJson = vi.fn().mockResolvedValue({
      offers: [
        {
          id: 2683104,
          guid: 'abc123',
          title: 'Estágio em Desenvolvimento de Software',
          slug: 'estagio-desenvolvimento-software',
          company_name: 'Acme Tecnologia',
          description: '<p>Desenvolvimento com Node.js e APIs REST.</p>',
          requirements: '<p>Git, Docker e vontade de aprender.</p>',
          location: 'Belém, Pará, Brasil',
          locations: [
            {
              name: 'Belém',
              city: 'Belém',
              state: 'Pará',
              country: 'Brasil',
            },
          ],
          remote: false,
          hybrid: true,
          on_site: false,
          employment_type_code: 'internship',
          published_at: '2026-10-05T08:00:00.000Z',
          careers_url: 'https://acme.recruitee.com/o/estagio-desenvolvimento-software',
          careers_apply_url:
            'https://acme.recruitee.com/o/estagio-desenvolvimento-software/c/new',
        },
      ],
    });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve(
      'https://acme.recruitee.com/o/estagio-desenvolvimento-software',
    );

    expect(result).toMatchObject({
      supported: true,
      platform: 'RECRUITEE',
      flow: 'ATS',
      missingFields: [],
      data: {
        externalId: '2683104',
        title: 'Estágio em Desenvolvimento de Software',
        company: 'Acme Tecnologia',
        description:
          'Desenvolvimento com Node.js e APIs REST.\n\nGit, Docker e vontade de aprender.',
        location: 'Belém',
        remoteType: 'HYBRID',
        employmentType: 'internship',
        applicationUrl: 'https://acme.recruitee.com/o/estagio-desenvolvimento-software/c/new',
        publishedAt: '2026-10-05T08:00:00.000Z',
      },
    });
    expect(String(getJson.mock.calls[0]?.[0])).toBe('https://acme.recruitee.com/api/offers/');
  });

  it('não inventa dados quando o slug não aparece no feed público', async () => {
    const getJson = vi.fn().mockResolvedValue({ offers: [] });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://acme.recruitee.com/o/vaga-removida');

    expect(result).toMatchObject({
      supported: false,
      platform: 'RECRUITEE',
      missingFields: ['title', 'company', 'description'],
    });
  });

  it('não consulta o feed quando a URL não contém slug de vaga', async () => {
    const getJson = vi.fn();
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://acme.recruitee.com/');

    expect(result).toMatchObject({
      supported: false,
      platform: 'RECRUITEE',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getJson).not.toHaveBeenCalled();
  });
});
