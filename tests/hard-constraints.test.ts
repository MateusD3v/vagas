import { describe, expect, it } from 'vitest';
import { calculateDeterministicMatch } from '../src/modules/matching/deterministic-matcher.js';
import { candidateFixture, jobFixture } from './fixtures.js';

describe('restrições eliminatórias', () => {
  it('elimina vaga incompatível por senioridade', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({ title: 'Engenheiro de Software Sênior', seniority: 'SENIOR' }),
    );
    expect(result.decision).toBe('SKIP');
    expect(result.hardConstraints.join(' ')).toMatch(/Senioridade/);
  });

  it('elimina vaga presencial em outra região sem mudança', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({ remoteType: 'ONSITE', city: 'Recife', state: 'PE', location: 'Recife, PE' }),
    );
    expect(result.decision).toBe('SKIP');
    expect(result.hardConstraints.join(' ')).toMatch(/outra região/);
  });

  it('não permite que score alto sobrescreva certificação obrigatória ausente', () => {
    const result = calculateDeterministicMatch(
      candidateFixture(),
      jobFixture({ requiredCertifications: ['AWS Solutions Architect'] }),
    );
    expect(result.score).toBe(100);
    expect(result.decision).toBe('SKIP');
  });
});
