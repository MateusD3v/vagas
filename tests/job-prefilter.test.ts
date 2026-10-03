import { describe, expect, it } from 'vitest';
import { JobPreFilterService } from '../src/modules/jobs/job-prefilter.service.js';

const service = new JobPreFilterService();
const candidate = {
  skills: ['Node.js', 'PostgreSQL'],
  seniorityLevels: ['JUNIOR'],
  remoteAllowed: true,
  hybridAllowed: true,
  onsiteAllowed: false,
};
const search = {
  keywords: ['Backend Developer'],
  excludedKeywords: ['Director'],
  locations: ['Remote'],
  remoteTypes: ['REMOTE' as const],
  employmentTypes: ['FULL_TIME'],
  seniorityLevels: ['JUNIOR'],
  publishedWithinHours: 24 * 14,
};
const job = {
  title: 'Junior Backend Developer',
  description: 'Node.js and PostgreSQL',
  location: 'Worldwide',
  remoteType: 'REMOTE' as const,
  employmentType: 'FULL_TIME',
  seniority: 'JUNIOR',
  publishedAt: new Date(),
  skills: [{ skill: 'Node.js' }, { skill: 'PostgreSQL' }],
};

describe('JobPreFilterService', () => {
  it('aprova vaga compatível e calcula prioridade', () => {
    const result = service.evaluate(job, search, candidate, 14);
    expect(result.passed).toBe(true);
    expect(result.preliminaryScore).toBe(100);
  });

  it('rejeita palavra-chave excluída', () => {
    const result = service.evaluate(
      { ...job, title: 'Engineering Director' },
      search,
      candidate,
      14,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Palavra-chave excluída/);
  });

  it('rejeita senioridade incompatível', () => {
    const result = service.evaluate(
      { ...job, title: 'Senior Backend Developer', seniority: 'SENIOR' },
      search,
      candidate,
      14,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Senioridade incompatível/);
  });

  it('rejeita vaga antiga', () => {
    const result = service.evaluate(
      { ...job, publishedAt: new Date('2025-01-01T00:00:00Z') },
      search,
      candidate,
      14,
      new Date('2026-10-03T00:00:00Z'),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/antiga/);
  });

  it('rejeita vaga presencial fora das localizações desejadas', () => {
    const result = service.evaluate(
      { ...job, location: 'Curitiba - PR', remoteType: 'ONSITE' },
      { ...search, locations: ['São Paulo - SP'], remoteTypes: ['ONSITE'] },
      { ...candidate, onsiteAllowed: true },
      14,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Localização não desejada/);
  });

  it('não restringe vaga remota à string de localização', () => {
    const result = service.evaluate(
      { ...job, location: 'Worldwide' },
      { ...search, locations: ['Brasil'] },
      candidate,
      14,
    );
    expect(result.passed).toBe(true);
  });

  it('rejeita vaga sem qualquer evidência de alinhamento', () => {
    const result = service.evaluate(
      {
        ...job,
        title: 'RPG AS400 Developer',
        description: 'JD Edwards EnterpriseOne and DB2',
        seniority: null,
        skills: [],
      },
      search,
      candidate,
      14,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Sem evidência de alinhamento/);
  });

  it('rejeita nível MID quando o perfil busca apenas início de carreira', () => {
    const result = service.evaluate(
      { ...job, title: 'Backend Developer', seniority: 'MID' },
      search,
      candidate,
      14,
    );
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/Senioridade não desejada/);
  });
});
