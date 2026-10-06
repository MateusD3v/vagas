import { describe, expect, it, vi } from 'vitest';
import { GupyJobSource } from '../src/integrations/job-sources/providers/gupy/gupy.adapter.js';
import type { JobSourceHttpClient } from '../src/integrations/job-sources/shared/http-client.js';

function mcpResponse(jobs: unknown[]): string {
  const toolPayload = JSON.stringify({
    data: {
      data: jobs,
      pagination: { total: jobs.length, limit: jobs.length || 1, offset: 0 },
    },
  });
  return [
    'event: message',
    `data: ${JSON.stringify({
      result: { content: [{ type: 'text', text: toolPayload }] },
      jsonrpc: '2.0',
      id: 1,
    })}`,
    '',
    '',
  ].join('\n');
}

describe('Gupy candidate MCP source', () => {
  const sample = {
    id: 12588999,
    companyId: 73528,
    name: 'Assistente de Suporte - TI',
    description:
      'Prestar suporte técnico aos usuários com Windows, redes, Service Desk, Git e REST API.',
    careerPageName: 'Empresa Belém',
    type: 'vacancy_type_effective',
    publishedDate: '2026-10-06T12:00:00.000Z',
    applicationDeadline: '2026-10-23',
    city: 'Belém',
    state: 'Pará',
    country: 'Brasil',
    jobUrl:
      'https://empresa.gupy.io/job/eyJqb2JJZCI6MTI1ODg5OTksInNvdXJjZSI6Im1jcF9jYW5kaWRhdGUifQ==?jobBoardSource=mcp_candidate',
    workplaceType: 'on-site',
    disabilities: true,
    isConfidentialCareerPage: false,
    salary: {
      status: 'range',
      label: 'R$ 3.000 a R$ 4.000',
      min: 3000,
      max: 4000,
      confidence: 'high',
    },
  };

  it('consulta o MCP oficial com termo e filtros do perfil em português', async () => {
    const postText = vi.fn().mockResolvedValue(mcpResponse([sample]));
    const adapter = new GupyJobSource({ postText } as unknown as JobSourceHttpClient, 50_000);

    const result = await adapter.searchJobs({
      keywords: ['Analista de Suporte'],
      locations: ['Belém', 'Ananindeua', 'Remoto'],
      remoteTypes: ['ONSITE', 'HYBRID', 'REMOTE'],
      employmentTypes: ['CLT'],
      publishedAfter: new Date('2026-10-01T00:00:00Z'),
      limit: 25,
    });

    expect(result).toHaveLength(1);
    expect(postText).toHaveBeenCalledOnce();
    expect(postText.mock.calls[0]?.[0]).toBe('https://candidates.mcp.api.gupy.io/mcp');
    expect(postText.mock.calls[0]?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'search_jobs',
        arguments: {
          term: 'Analista de Suporte',
          city: 'Belém,Ananindeua',
          state: 'Pará',
          country: 'Brasil',
          jobTypes: 'vacancy_type_effective',
          workplaceTypes: 'on-site,hybrid,remote',
          sortBy: 'publishedDate',
          sortOrder: 'desc',
        },
      },
    });
    expect(postText.mock.calls[0]?.[2]).toMatchObject({
      source: 'gupy',
      headers: {
        Accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
    });
  });

  it('normaliza a resposta pública sem inventar dados privados', () => {
    const adapter = new GupyJobSource({} as JobSourceHttpClient, 50_000);
    const job = adapter.normalizeJob(sample);

    expect(job).toMatchObject({
      source: 'gupy',
      externalId: '12588999',
      title: 'Assistente de Suporte - TI',
      company: 'Empresa Belém',
      city: 'Belém',
      state: 'Pará',
      country: 'Brasil',
      location: 'Belém, Pará, Brasil',
      remoteType: 'ONSITE',
      employmentType: 'CLT',
      salaryMin: 3000,
      salaryMax: 4000,
      applicationUrl: sample.jobUrl,
      originalUrl: sample.jobUrl,
    });
    expect(job.salaryCurrency).toBeUndefined();
    expect(job.rawData.attribution).toBe('Gupy');
    expect(job.rawData.transport).toBe('official-candidate-mcp');
    expect(job.skills.map((skill) => skill.skill)).toEqual(
      expect.arrayContaining(['Windows', 'Git', 'REST API']),
    );
  });

  it('preserva vaga confidencial como confidencial e não exige companyId', () => {
    const adapter = new GupyJobSource({} as JobSourceHttpClient, 50_000);
    const job = adapter.normalizeJob({
      ...sample,
      id: 12553888,
      companyId: undefined,
      careerPageName: 'Vagas Confidenciais',
      isConfidentialCareerPage: true,
      city: 'Ananindeua',
      state: 'Pará',
      salary: {
        status: 'not_disclosed',
        label: 'Esta vaga não possui faixa salarial informada.',
        confidence: 'high',
      },
    });

    expect(job.company).toBe('Vagas Confidenciais');
    expect(job.salaryMin).toBeUndefined();
    expect(job.salaryMax).toBeUndefined();
    expect(job.rawData.companyId).toBeUndefined();
    expect(job.rawData.isConfidentialCareerPage).toBe(true);
  });

  it('filtra localmente vagas anteriores à janela configurada', async () => {
    const postText = vi.fn().mockResolvedValue(
      mcpResponse([
        sample,
        {
          ...sample,
          id: 11000000,
          publishedDate: '2026-06-01T12:00:00.000Z',
          jobUrl: 'https://empresa.gupy.io/job/old-job',
        },
      ]),
    );
    const adapter = new GupyJobSource({ postText } as unknown as JobSourceHttpClient, 50_000);

    const result = await adapter.searchJobs({
      keywords: ['Suporte'],
      locations: ['Belém'],
      remoteTypes: ['ONSITE'],
      employmentTypes: [],
      publishedAfter: new Date('2026-10-01T00:00:00Z'),
      limit: 25,
    });

    expect(result.map((job) => job.id)).toEqual([12588999]);
  });

  it('falha de forma explícita se o envelope MCP mudar', async () => {
    const postText = vi.fn().mockResolvedValue('event: message\ndata: {"unexpected":true}\n\n');
    const adapter = new GupyJobSource({ postText } as unknown as JobSourceHttpClient, 50_000);

    await expect(
      adapter.searchJobs({
        keywords: ['Suporte'],
        locations: ['Belém'],
        remoteTypes: ['ONSITE'],
        employmentTypes: [],
        limit: 25,
      }),
    ).rejects.toMatchObject({ errorType: 'INVALID_RESPONSE' });
  });
});
