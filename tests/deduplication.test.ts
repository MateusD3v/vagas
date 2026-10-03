import { describe, expect, it } from 'vitest';
import {
  createCanonicalJobFingerprint,
  createJobFingerprint,
} from '../src/modules/jobs/job-fingerprint.js';

describe('deduplicação de vagas', () => {
  it('gera o mesmo fingerprint apesar de caixa, acentos e espaços', () => {
    const first = createJobFingerprint({
      company: 'Órbita Tech',
      title: 'Desenvolvedor Node.js Jr',
      location: 'São Paulo - SP',
      applicationUrl: 'https://example.test/jobs/1',
    });
    const second = createJobFingerprint({
      company: 'orbita   tech',
      title: 'DESENVOLVEDOR NODE.JS JR',
      location: 'sao paulo sp',
      applicationUrl: 'https://example.test/jobs/1',
    });
    expect(first).toBe(second);
  });

  it('gera fingerprints distintos para URLs de candidatura distintas', () => {
    const base = { company: 'Tech', title: 'Suporte', location: 'Remoto' };
    expect(createJobFingerprint({ ...base, applicationUrl: 'https://a.test/1' })).not.toBe(
      createJobFingerprint({ ...base, applicationUrl: 'https://a.test/2' }),
    );
  });

  it('ignora parâmetros conhecidos de tracking', () => {
    const base = { company: 'Tech', title: 'Backend', location: 'Remote' };
    expect(
      createJobFingerprint({ ...base, applicationUrl: 'https://jobs.test/1?utm_source=x&gclid=y' }),
    ).toBe(createJobFingerprint({ ...base, applicationUrl: 'https://jobs.test/1' }));
  });

  it('fingerprint canônico identifica a mesma vaga entre fontes sem fuzzy matching', () => {
    const first = createCanonicalJobFingerprint({
      company: 'ACME Ltda.',
      title: 'Backend Developer',
      location: 'Remote',
      applicationUrl: 'https://source-a.test/1',
    });
    const second = createCanonicalJobFingerprint({
      company: 'acme ltda',
      title: 'BACKEND DEVELOPER',
      location: 'remote',
      applicationUrl: 'https://source-b.test/99',
    });
    expect(first).toBe(second);
  });
});
