import { describe, expect, it } from 'vitest';
import { buildPortalSearchPlan } from '../src/modules/sources/portal-search-plan.js';

describe('portal search plan', () => {
  it('gera buscas para LinkedIn, Indeed e Glassdoor usando keywords e localizações do perfil', () => {
    const plan = buildPortalSearchPlan(
      {
        keywords: ['Analista de Suporte', 'Help Desk', 'Analista de Suporte'],
        locations: ['Belém', 'Ananindeua', 'Remoto'],
      },
      new Date('2026-10-06T12:00:00-03:00'),
    );

    expect(plan.generatedAt).toBe('2026-10-06T15:00:00.000Z');
    expect(plan.links).toHaveLength(12);
    expect(plan.links.filter((item) => item.portal === 'LINKEDIN')).toHaveLength(4);
    expect(plan.links.filter((item) => item.portal === 'INDEED')).toHaveLength(4);
    expect(plan.links.filter((item) => item.portal === 'GLASSDOOR')).toHaveLength(4);

    const linkedin = plan.links.find(
      (item) =>
        item.portal === 'LINKEDIN' &&
        item.query === 'Analista de Suporte' &&
        item.location === 'Belém',
    );
    const indeed = plan.links.find(
      (item) =>
        item.portal === 'INDEED' && item.query === 'Help Desk' && item.location === 'Ananindeua',
    );
    const glassdoor = plan.links.find(
      (item) =>
        item.portal === 'GLASSDOOR' &&
        item.query === 'Analista de Suporte' &&
        item.location === 'Belém',
    );

    expect(linkedin?.url).toContain('linkedin.com/jobs/search/');
    expect(indeed?.url).toContain('br.indeed.com/jobs?');
    expect(glassdoor?.url).toContain('glassdoor.com.br/Vaga/index.htm');
  });

  it('limita o plano e ignora remoto como localização textual quando há cidades', () => {
    const plan = buildPortalSearchPlan({
      keywords: ['A', 'B', 'C', 'D', 'E', 'F'],
      locations: ['Remoto', 'Belém', 'Ananindeua', 'São Paulo'],
    });

    expect(plan.links).toHaveLength(24);
    expect(plan.links.some((item) => item.location === 'Remoto')).toBe(false);
    expect(new Set(plan.links.map((item) => item.location))).toEqual(
      new Set(['Belém', 'Ananindeua']),
    );
  });

  it('usa fallback seguro quando o perfil ainda não possui keywords/localizações', () => {
    const plan = buildPortalSearchPlan({ keywords: [], locations: [] });

    expect(plan.links).toHaveLength(3);
    expect(plan.links.every((item) => item.query === 'Suporte TI')).toBe(true);
    expect(plan.links.every((item) => item.location === undefined)).toBe(true);
  });
});
