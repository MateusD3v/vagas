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
          careers_apply_url: 'https://acme.recruitee.com/o/estagio-desenvolvimento-software/c/new',
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

describe('AtsJobResolverService Workable', () => {
  it('carrega vaga publicada usando a API pública da conta Workable', async () => {
    const getJson = vi.fn().mockResolvedValue({
      name: 'Acme Tecnologia',
      jobs: [
        {
          title: 'Backend Developer',
          code: 'DEV-01',
          shortcode: 'ABC123',
          country: 'Brazil',
          state: 'Pará',
          city: 'Belém',
          department: 'Engineering',
          telecommuting: false,
          published_on: '2026-10-05',
          url: 'https://apply.workable.com/j/ABC123/apply',
          application_url: 'https://apply.workable.com/j/ABC123',
          shortlink: 'https://apply.workable.com/j/ABC123',
          created_at: '2026-10-04T12:00:00Z',
          description: '<p>Node.js, PostgreSQL e APIs REST.</p>',
          employment_type: 'Full-time',
          workplace_type: 'hybrid',
        },
      ],
    });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://apply.workable.com/acme/j/ABC123');

    expect(result).toMatchObject({
      supported: true,
      platform: 'WORKABLE',
      flow: 'ATS',
      missingFields: [],
      data: {
        externalId: 'ABC123',
        title: 'Backend Developer',
        company: 'Acme Tecnologia',
        description: 'Node.js, PostgreSQL e APIs REST.',
        location: 'Belém, Pará, Brazil',
        remoteType: 'HYBRID',
        employmentType: 'Full-time',
        applicationUrl: 'https://apply.workable.com/j/ABC123/apply',
        publishedAt: '2026-10-05',
      },
    });
    expect(String(getJson.mock.calls[0]?.[0])).toBe(
      'https://www.workable.com/api/accounts/acme?details=true',
    );
  });

  it('não consulta a API quando o shortlink não informa a conta', async () => {
    const getJson = vi.fn();
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://apply.workable.com/j/ABC123');

    expect(result).toMatchObject({
      supported: false,
      platform: 'WORKABLE',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getJson).not.toHaveBeenCalled();
  });

  it('não inventa dados quando a vaga não está mais publicada', async () => {
    const getJson = vi.fn().mockResolvedValue({
      name: 'Acme Tecnologia',
      jobs: [],
    });
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://apply.workable.com/acme/j/REMOVED');

    expect(result).toMatchObject({
      supported: false,
      platform: 'WORKABLE',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getJson).toHaveBeenCalledTimes(1);
  });
});

describe('AtsJobResolverService Personio', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
  <position>
    <id>12345</id>
    <subcompany><![CDATA[Acme Tecnologia]]></subcompany>
    <office><![CDATA[Remote Brazil]]></office>
    <department>Engineering</department>
    <recruitingCategory>Technology</recruitingCategory>
    <name><![CDATA[Estágio em Desenvolvimento de Software]]></name>
    <jobDescriptions>
      <jobDescription>
        <name>Responsabilidades</name>
        <value><![CDATA[<p>Desenvolver APIs REST com Node.js &amp; Java.</p>]]></value>
      </jobDescription>
      <jobDescription>
        <name>Requisitos</name>
        <value><![CDATA[<p>Git, Docker e vontade de aprender.</p>]]></value>
      </jobDescription>
    </jobDescriptions>
    <employmentType>intern</employmentType>
    <seniority>student</seniority>
    <schedule>full-time</schedule>
    <yearsOfExperience>lt-1</yearsOfExperience>
    <createdAt>2026-10-05T08:00:00+00:00</createdAt>
  </position>
  <position>
    <id>67890</id>
    <office>Belém</office>
    <name>Analista de Suporte</name>
    <jobDescriptions>
      <jobDescription>
        <name>Descrição</name>
        <value><![CDATA[<p>Suporte técnico e infraestrutura.</p>]]></value>
      </jobDescription>
    </jobDescriptions>
    <employmentType>permanent</employmentType>
    <schedule>full-time</schedule>
  </position>
</workzag-jobs>`;

  it('carrega a vaga pelo ID usando o XML público da carreira Personio', async () => {
    const getText = vi.fn().mockResolvedValue(feed);
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://acme.jobs.personio.de/job/12345');

    expect(result).toMatchObject({
      supported: true,
      platform: 'PERSONIO',
      flow: 'ATS',
      missingFields: [],
      data: {
        externalId: '12345',
        title: 'Estágio em Desenvolvimento de Software',
        company: 'Acme Tecnologia',
        description:
          'Responsabilidades\nDesenvolver APIs REST com Node.js & Java.\n\nRequisitos\nGit, Docker e vontade de aprender.',
        location: 'Remote Brazil',
        remoteType: 'REMOTE',
        employmentType: 'intern / full-time',
        applicationUrl: 'https://acme.jobs.personio.de/job/12345',
        publishedAt: '2026-10-05T08:00:00.000Z',
      },
    });
    expect(String(getText.mock.calls[0]?.[0])).toBe('https://acme.jobs.personio.de/xml');
  });

  it('preserva empresa como pendência quando subcompany não é publicado', async () => {
    const getText = vi.fn().mockResolvedValue(feed);
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://acme.jobs.personio.de/job/67890?display=pt');

    expect(result).toMatchObject({
      supported: true,
      platform: 'PERSONIO',
      missingFields: ['company'],
      data: {
        externalId: '67890',
        title: 'Analista de Suporte',
        location: 'Belém',
        remoteType: 'UNSPECIFIED',
        employmentType: 'permanent / full-time',
      },
    });
    expect(result.data?.company).toBeUndefined();
  });

  it('não consulta o feed quando a URL não contém ID da vaga', async () => {
    const getText = vi.fn();
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://acme.jobs.personio.de/');

    expect(result).toMatchObject({
      supported: false,
      platform: 'PERSONIO',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getText).not.toHaveBeenCalled();
  });

  it('não inventa dados quando o ID não está mais no feed público', async () => {
    const getText = vi.fn().mockResolvedValue(feed);
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://acme.jobs.personio.de/job/99999');

    expect(result).toMatchObject({
      supported: false,
      platform: 'PERSONIO',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getText).toHaveBeenCalledOnce();
  });
});


describe('AtsJobResolverService Pinpoint', () => {
  const feed = {
    data: [
      {
        id: '9447bc5f-30f9-4dbe-8531-3d66df1fc1a5',
        title: 'Estágio em Desenvolvimento Backend',
        description: '<p>Desenvolvimento de APIs REST com Node.js.</p>',
        key_responsibilities: '<p>Implementar integrações e corrigir bugs.</p>',
        skills_knowledge_expertise: '<p>Git, Docker e PostgreSQL.</p>',
        benefits: '<p>Horário flexível.</p>',
        employment_type: 'internship',
        employment_type_text: 'Internship',
        workplace_type: 'hybrid',
        workplace_type_text: 'Hybrid',
        compensation_visible: false,
        compensation_minimum: null,
        compensation_maximum: null,
        compensation_currency: null,
        compensation_frequency: null,
        deadline_at: '2026-11-01T23:59:59Z',
        created_at: '2026-10-05T08:00:00Z',
        url: 'https://careers.pinpointhq.com/en/postings/9447bc5f-30f9-4dbe-8531-3d66df1fc1a5',
        application_form_url:
          'https://careers.pinpointhq.com/en/postings/9447bc5f-30f9-4dbe-8531-3d66df1fc1a5/applications/new',
        path: '/en/postings/9447bc5f-30f9-4dbe-8531-3d66df1fc1a5',
        location: { id: '10', name: 'Belém, PA' },
        department: { id: '20', name: 'Engineering' },
        division: null,
        job: {
          id: '130185',
          requisition_id: 'ENG-001',
          department: { id: '20', name: 'Engineering' },
          division: null,
          structure_custom_group_one: null,
        },
      },
      {
        id: 'posting-2',
        title: 'Analista de Suporte',
        description: '<p>Suporte técnico e infraestrutura.</p>',
        employment_type: 'full_time',
        employment_type_text: 'Full Time',
        workplace_type: 'on_site',
        workplace_type_text: 'On site',
        compensation_visible: false,
        compensation_minimum: null,
        compensation_maximum: null,
        compensation_currency: null,
        compensation_frequency: null,
        deadline_at: null,
        created_at: null,
        url: 'https://careers.pinpointhq.com/en/jobs/53913',
        application_form_url: null,
        path: '/en/jobs/53913',
        location: { id: '11', name: 'Ananindeua, PA' },
        department: { id: '21', name: 'IT' },
        division: null,
        job: {
          id: '53913',
          requisition_id: null,
          department: { id: '21', name: 'IT' },
          division: null,
          structure_custom_group_one: null,
        },
      },
    ],
  };

  it('carrega publicação pública pelo UUID do posting', async () => {
    const getJson = vi.fn().mockResolvedValue(feed);
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve(
      'https://careers.pinpointhq.com/en/postings/9447bc5f-30f9-4dbe-8531-3d66df1fc1a5',
    );

    expect(result).toMatchObject({
      supported: true,
      platform: 'PINPOINT',
      flow: 'ATS',
      missingFields: ['company'],
      data: {
        externalId: '9447bc5f-30f9-4dbe-8531-3d66df1fc1a5',
        title: 'Estágio em Desenvolvimento Backend',
        description:
          'Desenvolvimento de APIs REST com Node.js.\n\nImplementar integrações e corrigir bugs.\n\nGit, Docker e PostgreSQL.\n\nHorário flexível.',
        location: 'Belém, PA',
        remoteType: 'HYBRID',
        employmentType: 'Internship',
        applicationUrl:
          'https://careers.pinpointhq.com/en/postings/9447bc5f-30f9-4dbe-8531-3d66df1fc1a5/applications/new',
        publishedAt: '2026-10-05T08:00:00Z',
      },
    });
    expect(result.data?.company).toBeUndefined();
    expect(String(getJson.mock.calls[0]?.[0])).toBe(
      'https://careers.pinpointhq.com/postings.json',
    );
  });

  it('também reconhece URL pública legada de job pelo ID interno', async () => {
    const getJson = vi.fn().mockResolvedValue(feed);
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://careers.pinpointhq.com/en/jobs/53913');

    expect(result).toMatchObject({
      supported: true,
      platform: 'PINPOINT',
      missingFields: ['company'],
      data: {
        externalId: 'posting-2',
        title: 'Analista de Suporte',
        location: 'Ananindeua, PA',
        remoteType: 'ONSITE',
        employmentType: 'Full Time',
        applicationUrl: 'https://careers.pinpointhq.com/en/jobs/53913',
      },
    });
  });

  it('não inventa dados quando a publicação não existe mais', async () => {
    const getJson = vi.fn().mockResolvedValue(feed);
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve(
      'https://careers.pinpointhq.com/en/postings/removed-posting',
    );

    expect(result).toMatchObject({
      supported: false,
      platform: 'PINPOINT',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getJson).toHaveBeenCalledOnce();
  });

  it('aceita URL sem ID somente quando ela corresponde exatamente ao url/path publicado', async () => {
    const getJson = vi.fn().mockResolvedValue(feed);
    const service = new AtsJobResolverService({ getJson } as unknown as JobSourceHttpClient);

    const result = await service.resolve(
      'https://careers.pinpointhq.com/en/postings/9447bc5f-30f9-4dbe-8531-3d66df1fc1a5?utm_source=test',
    );

    expect(result).toMatchObject({
      supported: true,
      platform: 'PINPOINT',
      data: { title: 'Estágio em Desenvolvimento Backend' },
    });
  });
});
