import { describe, expect, it } from 'vitest';
import { buildPortalSearchPlan } from '../src/modules/sources/portal-search-plan.js';

describe('portal search plan', () => {
  it('gera buscas assistidas para os principais portais usando keywords e localizações do perfil', () => {
    const plan = buildPortalSearchPlan(
      {
        keywords: ['Analista de Suporte', 'Help Desk', 'Analista de Suporte'],
        locations: ['Belém', 'Ananindeua', 'Remoto'],
      },
      new Date('2026-10-06T12:00:00-03:00'),
    );

    expect(plan.generatedAt).toBe('2026-10-06T15:00:00.000Z');
    expect(plan.links).toHaveLength(26);
    expect(plan.links.filter((item) => item.portal === 'LINKEDIN')).toHaveLength(4);
    expect(plan.links.filter((item) => item.portal === 'INDEED')).toHaveLength(4);
    expect(plan.links.filter((item) => item.portal === 'GLASSDOOR')).toHaveLength(4);
    expect(plan.links.filter((item) => item.portal === 'VAGASCOM')).toHaveLength(4);
    expect(plan.links.filter((item) => item.portal === 'INFOJOBS')).toHaveLength(4);
    expect(plan.links.filter((item) => item.portal === 'CATHO')).toHaveLength(4);
    const trainee = plan.links.filter((item) => item.portal === 'SEJATRAINEE');
    expect(trainee).toHaveLength(2);
    expect(trainee[0]?.url).toBe('https://sejatrainee.com.br/trainee/');
    expect(trainee[1]?.url).toContain('vagas-de-trainee-com-inscricoes-abertas');

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
    expect(
      plan.links.find(
        (item) =>
          item.portal === 'VAGASCOM' &&
          item.query === 'Analista de Suporte' &&
          item.location === 'Belém',
      )?.url,
    ).toContain('vagas.com.br/vagas-de-analista-de-suporte-em-belem');
    expect(
      plan.links.find(
        (item) =>
          item.portal === 'INFOJOBS' &&
          item.query === 'Help Desk' &&
          item.location === 'Ananindeua',
      )?.url,
    ).toContain('infojobs.com.br/vagas-de-emprego-help%2Bdesk-em-ananindeua%2C-pa.aspx');
    expect(
      plan.links.find(
        (item) =>
          item.portal === 'CATHO' &&
          item.query === 'Analista de Suporte' &&
          item.location === 'Belém',
      )?.url,
    ).toContain('catho.com.br/vagas/analista-de-suporte/belem-pa/');
  });

  it('limita o plano e ignora remoto como localização textual quando há cidades', () => {
    const plan = buildPortalSearchPlan({
      keywords: ['A', 'B', 'C', 'D', 'E', 'F'],
      locations: ['Remoto', 'Belém', 'Ananindeua', 'São Paulo'],
    });

    expect(plan.links).toHaveLength(50);
    expect(plan.links.some((item) => item.location === 'Remoto')).toBe(false);
    expect(
      new Set(
        plan.links.filter((item) => item.portal !== 'SEJATRAINEE').map((item) => item.location),
      ),
    ).toEqual(new Set(['Belém', 'Ananindeua']));
  });

  it('usa fallback seguro quando o perfil ainda não possui keywords/localizações', () => {
    const plan = buildPortalSearchPlan({ keywords: [], locations: [] });

    expect(plan.links).toHaveLength(8);
    expect(
      plan.links
        .filter((item) => item.portal !== 'SEJATRAINEE')
        .every((item) => item.query === 'Suporte TI'),
    ).toBe(true);
    expect(plan.links.every((item) => item.location === undefined)).toBe(true);
  });
});
