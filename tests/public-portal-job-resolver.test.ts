import { describe, expect, it, vi } from 'vitest';
import { AtsJobResolverService } from '../src/modules/jobs/ats-job-resolver.service.js';
import type { JobSourceHttpClient } from '../src/integrations/job-sources/shared/http-client.js';

describe('AtsJobResolverService restricted public portals', () => {
  const publicJobPage = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Analista de Suporte",
        "description": "<p>Suporte técnico, redes e atendimento a usuários.</p>",
        "datePosted": "2026-10-06",
        "employmentType": "FULL_TIME",
        "hiringOrganization": {
          "@type": "Organization",
          "name": "Empresa Exemplo"
        },
        "jobLocation": {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Belém",
            "addressRegion": "PA",
            "addressCountry": "BR"
          }
        },
        "url": "https://www.linkedin.com/jobs/view/1234567890"
      }
    </script>
  </head>
</html>`;

  it('lê JobPosting público de uma vaga individual do LinkedIn sem autenticação', async () => {
    const getText = vi.fn().mockResolvedValue(publicJobPage);
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://www.linkedin.com/jobs/view/1234567890');

    expect(result).toMatchObject({
      supported: true,
      platform: 'LINKEDIN',
      flow: 'MANUAL',
      missingFields: [],
      data: {
        title: 'Analista de Suporte',
        company: 'Empresa Exemplo',
        description: 'Suporte técnico, redes e atendimento a usuários.',
        location: 'Belém, PA, BR',
        remoteType: 'UNSPECIFIED',
        employmentType: 'FULL_TIME',
        applicationUrl: 'https://www.linkedin.com/jobs/view/1234567890',
        publishedAt: '2026-10-06T00:00:00.000Z',
      },
    });
    expect(getText).toHaveBeenCalledOnce();
  });

  it('lê JobPosting público de uma vaga individual do Vagas.com.br', async () => {
    const getText = vi
      .fn()
      .mockResolvedValue(
        publicJobPage.replace(
          'https://www.linkedin.com/jobs/view/1234567890',
          'https://www.vagas.com.br/vagas/v1234567/analista-de-suporte',
        ),
      );
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve(
      'https://www.vagas.com.br/vagas/v1234567/analista-de-suporte',
    );

    expect(result).toMatchObject({
      supported: true,
      platform: 'VAGASCOM',
      flow: 'MANUAL',
      missingFields: [],
      data: {
        title: 'Analista de Suporte',
        company: 'Empresa Exemplo',
        location: 'Belém, PA, BR',
      },
    });
    expect(getText).toHaveBeenCalledOnce();
  });

  it('falha com segurança quando o Indeed não expõe JobPosting público', async () => {
    const getText = vi
      .fn()
      .mockResolvedValue(
        '<html><head><script type="application/ld+json">{"@type":"WebSite"}</script></head></html>',
      );
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve('https://br.indeed.com/viewjob?jk=abc123');

    expect(result).toMatchObject({
      supported: false,
      platform: 'INDEED',
      flow: 'MANUAL',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getText).toHaveBeenCalledOnce();
  });

  it('não tenta contornar bloqueio da página pública do Glassdoor', async () => {
    const getText = vi.fn().mockRejectedValue(new Error('403'));
    const service = new AtsJobResolverService({ getText } as unknown as JobSourceHttpClient);

    const result = await service.resolve(
      'https://www.glassdoor.com.br/job-listing/analista-de-suporte-JV_IC2479910_KO0,20.htm',
    );

    expect(result).toMatchObject({
      supported: false,
      platform: 'GLASSDOOR',
      flow: 'MANUAL',
      missingFields: ['title', 'company', 'description'],
    });
    expect(getText).toHaveBeenCalledOnce();
  });
});
