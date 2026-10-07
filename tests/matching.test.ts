import { describe, expect, it } from 'vitest';
import { calculateDeterministicMatch } from '../src/modules/matching/deterministic-matcher.js';
import { clampScore } from '../src/modules/matching/matching.config.js';
import { candidateFixture, jobFixture } from './fixtures.js';

describe('matching determinístico', () => {
  it('não reduz a nota por diferenciais ausentes ou experiência apenas desejável', () => {
    const base = jobFixture();
    const result = calculateDeterministicMatch(candidateFixture(), {
      ...base,
      skills: [...base.skills, { skill: 'Java', required: false, yearsRequired: 10 }],
    });
    expect(result.score).toBe(100);
    expect(result.decision).toBe('APPLY');
    expect(result.missingSkills).not.toContain('Java');
    expect(result.matchedSkills).not.toContain('Java');
  });

  it('diferenciais compatíveis não escondem lacunas obrigatórias', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({
        skills: [
          { skill: 'Java', required: true, yearsRequired: null },
          { skill: 'Node.js', required: false, yearsRequired: null },
          { skill: 'Git', required: false, yearsRequired: null },
        ],
      }),
    );
    expect(result.components.skills).toBe(0);
    expect(result.missingSkills).toEqual(['Java']);
    expect(result.decision).not.toBe('APPLY');
  });

  it('usa competências desejáveis como evidência quando não há obrigatórias', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({
        skills: [
          { skill: 'Node.js', required: false, yearsRequired: null },
          { skill: 'Java', required: false, yearsRequired: null },
        ],
      }),
    );
    expect(result.components.skills).toBe(17.5);
    expect(result.missingSkills).toEqual([]);
  });

  it('mantém qualquer score entre 0 e 100', () => {
    expect(clampScore(-50)).toBe(0);
    expect(clampScore(123)).toBe(100);
  });

  it('decide APPLY no threshold configurado', () => {
    const result = calculateDeterministicMatch(candidateFixture(), jobFixture());
    expect(result.score).toBe(100);
    expect(result.decision).toBe('APPLY');
    expect(result.matchedSkills).toEqual(['Node.js', 'PostgreSQL', 'Git']);
  });

  it('mantém cargo adjacente em REVIEW mesmo quando o score alcança o threshold de APPLY', () => {
    const result = calculateDeterministicMatch(
      candidateFixture({
        preferences: {
          ...candidateFixture().preferences,
          desiredRoles: ['Analista de Dados'],
        },
      }),
      jobFixture(),
    );
    expect(result.score).toBe(85);
    expect(result.decision).toBe('REVIEW');
    expect(result.weaknesses).toContain('Cargo fora dos objetivos prioritários');

    const stricter = calculateDeterministicMatch(
      candidateFixture({
        preferences: {
          ...candidateFixture().preferences,
          desiredRoles: ['Analista de Dados'],
          automaticApplicationThreshold: 90,
        },
      }),
      jobFixture(),
    );
    expect(stricter.decision).toBe('REVIEW');
  });

  it('decide SKIP abaixo do threshold', () => {
    const result = calculateDeterministicMatch(
      candidateFixture({ skills: [], experiences: [], yearsOfExperience: 0 }),
      jobFixture({ title: 'Analista de Dados', seniority: 'MID' }),
    );
    expect(result.score).toBeLessThan(65);
    expect(result.decision).toBe('SKIP');
  });

  it('reconhece skills compatíveis e reporta as obrigatórias ausentes', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({
        skills: [
          { skill: 'Node.js', required: true, yearsRequired: 1 },
          { skill: 'Java', required: true, yearsRequired: 1 },
        ],
      }),
    );
    expect(result.matchedSkills).toContain('Node.js');
    expect(result.missingSkills).toContain('Java');
  });

  it('não concede APPLY quando cargo e competências não têm evidência de alinhamento', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({
        title: 'RPG AS400 Developer',
        description: 'JD Edwards EnterpriseOne and DB2',
        skills: [],
        seniority: null,
      }),
    );
    expect(result.decision).toBe('SKIP');
    expect(result.hardConstraints.join(' ')).toMatch(/Sem evidência de alinhamento/);
    expect(result.components.skills).toBe(0);
  });

  it('não usa Git isoladamente para aprovar cargo não relacionado', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({
        title: 'Inside Sales Contractor',
        description: 'Sales operations',
        skills: [{ skill: 'Git', required: false, yearsRequired: null }],
        seniority: null,
      }),
    );
    expect(result.decision).toBe('SKIP');
    expect(result.hardConstraints.join(' ')).toMatch(/competências relevantes/);
  });
});
