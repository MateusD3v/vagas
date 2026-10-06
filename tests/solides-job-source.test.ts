import { describe, expect, it, vi } from 'vitest';
import { SolidesJobSource } from '../src/integrations/job-sources/providers/solides/solides.adapter.js';
import type { JobSourceHttpClient } from '../src/integrations/job-sources/shared/http-client.js';

describe('Sólides public job source', () => {
  const searchHtml = `<!doctype html><html><body>
    <a href="/vaga/739158/assistente-de-suporte-ti">Assistente de Suporte TI</a>
    <a href="/vaga/739158/assistente-de-suporte-ti?origem=busca">duplicada</a>
  </body></html>`;

  const detailHtml = `<!doctype html><html><head>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      "identifier": {"@type": "PropertyValue", "name": "Sólides", "value": "739158"},
      "title": "Assistente de Suporte TI",
      "description": "<p>Atendimento de suporte, Windows, redes, Git e REST API. Contratação CLT.</p>",
      "datePosted": "2026-10-06",
      "employmentType": "FULL_TIME",
      "hiringOrganization": {"@type": "Organization", "name": "Empresa Belém"},
      "jobLocation": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Belém",
          "addressRegion": "PA",
          "addressCountry": "BR"
        }
      }
    }
    </script>
  </head></html>`;

  it('descobre a página pública de Belém, lê JobPosting e filtra por keyword', async () => {
    const getText = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://vagas.solides.com.br/vagas/todas/belem-pa') return searchHtml;
      if (url === 'https://vagas.solides.com.br/vaga/739158/assistente-de-suporte-ti') {
        return detailHtml;
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    const adapter = new SolidesJobSource({ getText } as unknown as JobSourceHttpClient, 50_000);

    const jobs = await adapter.searchJobs({
      keywords: ['Suporte TI'],
      locations: ['Belém'],
      remoteTypes: ['ONSITE'],
      employmentTypes: ['CLT'],
      limit: 20,
    });

    expect(jobs).toHaveLength(1);
    expect(getText).toHaveBeenCalledTimes(2);
    expect(getText.mock.calls[0]?.[0]).toBe('https://vagas.solides.com.br/vagas/todas/belem-pa');

    const job = adapter.normalizeJob(jobs[0]);
    expect(job).toMatchObject({
      source: 'solides',
      externalId: '739158',
      title: 'Assistente de Suporte TI',
      company: 'Empresa Belém',
      city: 'Belém',
      state: 'PA',
      country: 'BR',
      remoteType: 'ONSITE',
      employmentType: 'CLT',
      applicationUrl: 'https://vagas.solides.com.br/vaga/739158/assistente-de-suporte-ti',
      originalUrl: 'https://vagas.solides.com.br/vaga/739158/assistente-de-suporte-ti',
    });
    expect(job.description).not.toContain('<p>');
    expect(job.rawData.attribution).toBe('Sólides Vagas');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Windows', 'Git', 'REST API']),
    );
  });

  it('normaliza vaga remota e usa o ID da URL quando identifier não vier publicado', () => {
    const adapter = new SolidesJobSource({} as JobSourceHttpClient, 50_000);
    const job = adapter.normalizeJob({
      url: 'https://empresa.vagas.solides.com.br/vaga/925752/desenvolvedor-junior',
      posting: {
        '@type': 'JobPosting',
        title: 'Desenvolvedor Júnior',
        description: '<p>Node.js, Java, Docker e Git em trabalho remoto.</p>',
        hiringOrganization: { name: 'Empresa Tech' },
        jobLocationType: 'TELECOMMUTE',
        employmentType: 'FULL_TIME',
        datePosted: '2026-10-05T12:00:00Z',
        baseSalary: {
          currency: 'BRL',
          value: { minValue: 3000, maxValue: 4500, unitText: 'MONTH' },
        },
      },
    });

    expect(job.externalId).toBe('925752');
    expect(job.remoteType).toBe('REMOTE');
    expect(job.location).toBe('Remoto');
    expect(job.seniority).toBe('JUNIOR');
    expect(job.salaryMin).toBe(3000);
    expect(job.salaryMax).toBe(4500);
    expect(job.salaryCurrency).toBe('BRL');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Node.js', 'Java', 'Docker', 'Git']),
    );
  });

  it('não inventa vagas quando a página pública muda e deixa de expor links reconhecíveis', async () => {
    const getText = vi.fn().mockResolvedValue('<html><body>sem vagas estruturadas</body></html>');
    const adapter = new SolidesJobSource({ getText } as unknown as JobSourceHttpClient, 50_000);

    await expect(
      adapter.searchJobs({
        keywords: ['Analista de TI'],
        locations: ['Ananindeua'],
        remoteTypes: ['ONSITE'],
        employmentTypes: [],
        limit: 12,
      }),
    ).rejects.toMatchObject({ errorType: 'INVALID_RESPONSE' });

    expect(getText.mock.calls[0]?.[0]).toBe(
      'https://vagas.solides.com.br/vagas/todas/ananindeua-pa',
    );
  });
});
