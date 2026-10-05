import { describe, expect, it, vi } from 'vitest';
import { ArbeitnowJobSource } from '../src/integrations/job-sources/providers/arbeitnow/arbeitnow.adapter.js';
import { HimalayasJobSource } from '../src/integrations/job-sources/providers/himalayas/himalayas.adapter.js';
import { JobicyJobSource } from '../src/integrations/job-sources/providers/jobicy/jobicy.adapter.js';
import { RemotiveJobSource } from '../src/integrations/job-sources/providers/remotive/remotive.adapter.js';
import { RemoteOkJobSource } from '../src/integrations/job-sources/providers/remoteok/remoteok.adapter.js';
import { WeWorkRemotelyJobSource } from '../src/integrations/job-sources/providers/weworkremotely/weworkremotely.adapter.js';
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

  it('não trata nível de experiência da Arbeitnow como tipo de contratação', () => {
    const adapter = new ArbeitnowJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob({
      slug: 'support-1',
      company_name: 'Example GmbH',
      title: 'Technical Support Specialist',
      description: 'IT support and troubleshooting',
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/support-1',
      tags: ['Support'],
      job_types: ['Experienced'],
      location: 'Remote',
      created_at: 1_759_276_800,
    });
    expect(job.employmentType).toBeUndefined();
  });

  it('separa nível de experiência do tipo de contratação da Arbeitnow', () => {
    const adapter = new ArbeitnowJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob({
      slug: 'backend-experienced-1',
      company_name: 'Example GmbH',
      title: 'Backend Developer',
      description: '<div>Java and APIs</div>',
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/backend-experienced-1',
      tags: ['Java'],
      job_types: ['Experienced', 'Permanent', 'Full time'],
      location: 'Remote',
      created_at: 1_759_276_800,
    });

    expect(job.employmentType).toBe('FULL_TIME');
    expect(job.seniority).toBe('MID');
  });

  it('não transforma nível Experienced em tipo de contratação', () => {
    const adapter = new ArbeitnowJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob({
      slug: 'support-experienced-1',
      company_name: 'Example GmbH',
      title: 'IT Support Specialist',
      description: 'Support users and systems',
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/support-experienced-1',
      tags: [],
      job_types: ['Experienced', 'Permanent'],
      location: 'Remote',
      created_at: 1_759_276_800,
    });

    expect(job.employmentType).toBeUndefined();
    expect(job.seniority).toBe('MID');
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

describe('Himalayas adapter', () => {
  const sample = {
    title: 'Junior Backend Developer',
    excerpt: 'Build backend APIs',
    companyName: 'Example Remote',
    companySlug: 'example-remote',
    companyLogo: 'https://example.com/logo.png',
    employmentType: 'Full Time',
    minSalary: 3000,
    maxSalary: 5000,
    salaryPeriod: 'monthly',
    seniority: ['Entry-level'],
    currency: 'USD',
    locationRestrictions: [{ alpha2: 'BR', name: 'Brazil', slug: 'brazil' }],
    timezoneRestrictions: ['UTC-3'],
    categories: ['Engineering', 'Node.js'],
    parentCategories: ['Engineering'],
    description: '<p>Node.js, PostgreSQL, Git and REST API.</p>',
    pubDate: 1791201600000,
    expiryDate: 1793793600000,
    applicationLink: 'https://himalayas.app/companies/example-remote/jobs/junior-backend',
    guid: 'himalayas-guid-1',
  };

  it('normaliza vaga remota, localização e atribuição sem anualizar salário mensal', () => {
    const adapter = new HimalayasJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob(sample);

    expect(job.source).toBe('himalayas');
    expect(job.externalId).toBe('himalayas-guid-1');
    expect(job.remoteType).toBe('REMOTE');
    expect(job.location).toBe('Brazil');
    expect(job.country).toBe('Brazil');
    expect(job.employmentType).toBe('FULL_TIME');
    expect(job.seniority).toBe('JUNIOR');
    expect(job.salaryMin).toBeUndefined();
    expect(job.salaryMax).toBeUndefined();
    expect(job.publishedAt).toEqual(new Date(1791201600000));
    expect(job.applicationUrl).toContain('himalayas.app');
    expect(job.rawData.attribution).toBe('Himalayas');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Node.js', 'PostgreSQL', 'Git', 'REST API']),
    );
  });

  it('aceita a variante oficial com países string, fusos numéricos e timestamps em segundos', () => {
    const officialShape = {
      ...sample,
      locationRestrictions: ['Brazil', 'Portugal'],
      timezoneRestrictions: [-3, 0, 1],
      pubDate: 1791201600,
      expiryDate: 1793793600,
      guid: 'himalayas-official-shape',
    };
    const adapter = new HimalayasJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob(officialShape);

    expect(job.location).toBe('Brazil, Portugal');
    expect(job.country).toBeUndefined();
    expect(job.publishedAt).toEqual(new Date(1791201600 * 1000));
    expect(job.rawData.locationRestrictions).toEqual(['Brazil', 'Portugal']);
    expect(job.rawData.timezoneRestrictions).toEqual([-3, 0, 1]);
  });

  it('faz uma busca pública conservadora usando somente uma keyword', async () => {
    const getJson = vi.fn().mockResolvedValue({ jobs: [sample] });
    const adapter = new HimalayasJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const jobs = await adapter.searchJobs({
      keywords: ['Node.js', 'Java'],
      locations: ['Brazil'],
      remoteTypes: ['REMOTE'],
      employmentTypes: ['FULL_TIME'],
      limit: 25,
    });

    expect(jobs).toHaveLength(1);
    expect(getJson).toHaveBeenCalledOnce();
    expect(String(getJson.mock.calls[0]?.[0])).toContain('https://himalayas.app/jobs/api/search');
    expect(String(getJson.mock.calls[0]?.[0])).toContain('q=Node.js');
    expect(String(getJson.mock.calls[0]?.[0])).toContain('sort=recent');
  });

  it('aceita logo vazia observada no feed público sem derrubar a vaga', () => {
    const adapter = new HimalayasJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob({
      ...sample,
      companyName: 'Work Better Now',
      companySlug: 'work-better-now',
      companyLogo: '',
      guid: 'https://himalayas.app/companies/work-better-now/jobs/ai-software-developer',
      applicationLink:
        'https://himalayas.app/companies/work-better-now/jobs/ai-software-developer',
    });

    expect(job.company).toBe('Work Better Now');
    expect(job.rawData.companyLogo).toBeUndefined();
  });

  it('limita o resultado localmente a no máximo 20 vagas', async () => {
    const jobs = Array.from({ length: 24 }, (_, index) => ({
      ...sample,
      guid: 'himalayas-guid-' + index,
    }));
    const getJson = vi.fn().mockResolvedValue({ jobs });
    const adapter = new HimalayasJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const result = await adapter.searchJobs({
      keywords: ['Support'],
      locations: [],
      remoteTypes: ['REMOTE'],
      employmentTypes: [],
      limit: 50,
    });

    expect(result).toHaveLength(20);
  });
});

describe('Remote OK adapter', () => {
  const sample = {
    slug: 'junior-backend-developer-example',
    id: 'remoteok-123',
    epoch: 1791201600,
    date: '2026-10-05T12:00:00+00:00',
    company: 'Example Remote',
    company_logo: '',
    position: 'Junior Backend Developer',
    tags: ['node.js', 'postgresql', 'full time', 'git'],
    description: '<p>Build REST API services with Node.js and PostgreSQL.</p>',
    location: 'Worldwide',
    salary_min: 45000,
    salary_max: 65000,
    apply_url: 'https://remoteok.com/remote-jobs/remoteok-123',
    original: true,
    logo: '',
    url: 'https://remoteok.com/remote-jobs/remoteok-123',
  };

  it('normaliza uma vaga preservando atribuição e link de volta ao Remote OK', () => {
    const adapter = new RemoteOkJobSource(unusedHttp, 50_000);
    const job = adapter.normalizeJob(sample);

    expect(job.source).toBe('remoteok');
    expect(job.externalId).toBe('remoteok-123');
    expect(job.remoteType).toBe('REMOTE');
    expect(job.employmentType).toBe('FULL_TIME');
    expect(job.seniority).toBe('JUNIOR');
    expect(job.description).not.toContain('<p>');
    expect(job.salaryMin).toBe(45000);
    expect(job.salaryMax).toBe(65000);
    expect(job.salaryCurrency).toBeUndefined();
    expect(job.applicationUrl).toBe('https://remoteok.com/remote-jobs/remoteok-123');
    expect(job.originalUrl).toBe('https://remoteok.com/remote-jobs/remoteok-123');
    expect(job.rawData.attribution).toBe('Remote OK');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Node.js', 'PostgreSQL', 'Git', 'REST API']),
    );
  });

  it('ignora metadados legais e filtra keywords localmente com uma única chamada', async () => {
    const getJson = vi.fn().mockResolvedValue([
      {
        last_updated: 1791201603,
        legal: 'Please link back to Remote OK.',
      },
      sample,
      {
        ...sample,
        id: 'remoteok-456',
        slug: 'product-designer',
        position: 'Product Designer',
        tags: ['design'],
        description: '<p>Design product interfaces.</p>',
        url: 'https://remoteok.com/remote-jobs/remoteok-456',
        apply_url: 'https://remoteok.com/remote-jobs/remoteok-456',
      },
    ]);
    const adapter = new RemoteOkJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const jobs = await adapter.searchJobs({
      keywords: ['Node.js'],
      locations: [],
      remoteTypes: ['REMOTE'],
      employmentTypes: [],
      limit: 25,
    });

    expect(jobs.map((job) => String(job.id))).toEqual(['remoteok-123']);
    expect(getJson).toHaveBeenCalledOnce();
    expect(String(getJson.mock.calls[0]?.[0])).toBe('https://remoteok.com/api');
  });

  it('aceita vaga real com slug vazio porque o ID continua sendo a identidade da fonte', async () => {
    const getJson = vi.fn().mockResolvedValue([
      { last_updated: 1791201603, legal: 'Please link back to Remote OK.' },
      {
        ...sample,
        slug: '',
        id: '1136379',
        url: 'https://remoteok.com/remote-jobs/',
        apply_url: 'https://remoteok.com/remote-jobs/',
      },
    ]);
    const adapter = new RemoteOkJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const jobs = await adapter.searchJobs({
      keywords: [],
      locations: [],
      remoteTypes: ['REMOTE'],
      employmentTypes: [],
      limit: 25,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.slug).toBe('');
    expect(String(jobs[0]?.id)).toBe('1136379');
    expect(adapter.normalizeJob(jobs[0]).externalId).toBe('1136379');
  });

  it('não descarta a primeira vaga quando o feed vier sem objeto de metadados', async () => {
    const getJson = vi.fn().mockResolvedValue([sample]);
    const adapter = new RemoteOkJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    const jobs = await adapter.searchJobs({
      keywords: [],
      locations: [],
      remoteTypes: ['REMOTE'],
      employmentTypes: [],
      limit: 25,
    });

    expect(jobs.map((job) => String(job.id))).toEqual(['remoteok-123']);
  });

  it('recusa payload com item de vaga inválido em vez de ocultar mudança de schema', async () => {
    const getJson = vi
      .fn()
      .mockResolvedValue([
        { last_updated: 1791201603, legal: 'Please link back to Remote OK.' },
        sample,
        { id: 'broken', position: 'Missing company and URLs' },
      ]);
    const adapter = new RemoteOkJobSource({ getJson } as unknown as JobSourceHttpClient, 50_000);

    await expect(
      adapter.searchJobs({
        keywords: [],
        locations: [],
        remoteTypes: ['REMOTE'],
        employmentTypes: [],
        limit: 25,
      }),
    ).rejects.toMatchObject({ errorType: 'INVALID_RESPONSE' });
  });
});

describe('We Work Remotely adapter', () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>We Work Remotely</title>
    <item>
      <title><![CDATA[Example Remote: Junior Backend Developer]]></title>
      <link>https://weworkremotely.com/remote-jobs/example-junior-backend</link>
      <guid>wwr-guid-1</guid>
      <pubDate>Mon, 05 Oct 2026 12:00:00 +0000</pubDate>
      <description><![CDATA[<p>Build REST API services with Node.js &amp; PostgreSQL using Git.</p>]]></description>
      <region>Anywhere in the World</region>
      <country>Brazil</country>
      <state>Pará</state>
      <category>Back-End Programming</category>
      <type>Full-Time</type>
      <skills>Node.js, PostgreSQL, Git</skills>
      <expires_at>2026-11-04T12:00:00Z</expires_at>
    </item>
    <item>
      <title>Design Co: Product Designer</title>
      <link>https://weworkremotely.com/remote-jobs/design-product-designer</link>
      <guid>wwr-guid-2</guid>
      <pubDate>Mon, 05 Oct 2026 11:00:00 +0000</pubDate>
      <description><![CDATA[<p>Design interfaces and prototypes.</p>]]></description>
      <region>North America Only</region>
      <category>Design</category>
      <type>Contract</type>
      <skills>Figma, UX</skills>
    </item>
  </channel>
</rss>`;

  it('lê RSS, separa empresa/cargo e filtra keywords localmente', async () => {
    const getText = vi.fn().mockResolvedValue(rss);
    const adapter = new WeWorkRemotelyJobSource(
      { getText } as unknown as JobSourceHttpClient,
      50_000,
    );

    const jobs = await adapter.searchJobs({
      keywords: ['Node.js'],
      locations: [],
      remoteTypes: ['REMOTE'],
      employmentTypes: [],
      limit: 25,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: 'Example Remote',
      position: 'Junior Backend Developer',
      guid: 'wwr-guid-1',
      region: 'Anywhere in the World',
      country: 'Brazil',
      state: 'Pará',
      category: 'Back-End Programming',
      type: 'Full-Time',
      skills: 'Node.js, PostgreSQL, Git',
    });
    expect(getText).toHaveBeenCalledOnce();
    expect(String(getText.mock.calls[0]?.[0])).toBe('https://weworkremotely.com/remote-jobs.rss');
  });

  it('normaliza atribuição, link de volta, localização e tecnologias', async () => {
    const getText = vi.fn().mockResolvedValue(rss);
    const adapter = new WeWorkRemotelyJobSource(
      { getText } as unknown as JobSourceHttpClient,
      50_000,
    );
    const [raw] = await adapter.searchJobs({
      keywords: ['Node.js'],
      locations: [],
      remoteTypes: ['REMOTE'],
      employmentTypes: [],
      limit: 25,
    });
    const job = adapter.normalizeJob(raw);

    expect(job.source).toBe('weworkremotely');
    expect(job.externalId).toBe('wwr-guid-1');
    expect(job.title).toBe('Junior Backend Developer');
    expect(job.company).toBe('Example Remote');
    expect(job.remoteType).toBe('REMOTE');
    expect(job.employmentType).toBe('FULL_TIME');
    expect(job.seniority).toBe('JUNIOR');
    expect(job.location).toBe('Anywhere in the World, Brazil, Pará');
    expect(job.country).toBe('Brazil');
    expect(job.state).toBe('Pará');
    expect(job.description).not.toContain('<p>');
    expect(job.applicationUrl).toBe(
      'https://weworkremotely.com/remote-jobs/example-junior-backend',
    );
    expect(job.originalUrl).toBe(job.applicationUrl);
    expect(job.rawData.attribution).toBe('We Work Remotely');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Node.js', 'PostgreSQL', 'Git', 'REST API']),
    );
  });

  it('usa dc:creator quando o título não contém empresa', async () => {
    const creatorRss = `<rss><channel><item>
      <title>Backend Developer</title>
      <dc:creator><![CDATA[Creator Company]]></dc:creator>
      <link>https://weworkremotely.com/remote-jobs/creator-backend</link>
      <guid>creator-guid</guid>
      <pubDate>Mon, 05 Oct 2026 10:00:00 +0000</pubDate>
      <description>Node.js backend</description>
    </item></channel></rss>`;
    const getText = vi.fn().mockResolvedValue(creatorRss);
    const adapter = new WeWorkRemotelyJobSource(
      { getText } as unknown as JobSourceHttpClient,
      50_000,
    );

    const jobs = await adapter.searchJobs({
      keywords: [],
      locations: [],
      remoteTypes: ['REMOTE'],
      employmentTypes: [],
      limit: 25,
    });

    expect(jobs[0]).toMatchObject({
      company: 'Creator Company',
      position: 'Backend Developer',
    });
  });

  it('rejeita RSS sem vagas utilizáveis em vez de inventar empresa', async () => {
    const invalidRss = `<rss><channel><item>
      <title>Backend Developer</title>
      <link>https://weworkremotely.com/remote-jobs/no-company</link>
      <guid>no-company</guid>
      <pubDate>Mon, 05 Oct 2026 10:00:00 +0000</pubDate>
    </item></channel></rss>`;
    const getText = vi.fn().mockResolvedValue(invalidRss);
    const adapter = new WeWorkRemotelyJobSource(
      { getText } as unknown as JobSourceHttpClient,
      50_000,
    );

    await expect(
      adapter.searchJobs({
        keywords: [],
        locations: [],
        remoteTypes: ['REMOTE'],
        employmentTypes: [],
        limit: 25,
      }),
    ).rejects.toMatchObject({ errorType: 'INVALID_RESPONSE' });
  });
});
