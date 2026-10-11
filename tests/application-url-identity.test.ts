import { describe, expect, it } from 'vitest';
import { applicationUrlIdentity } from '../src/modules/applications/application-url-identity.js';

describe('job application URL identity', () => {
  it('ignora rastreamento, fragmento e barra final sem perder o identificador da vaga', () => {
    const first = 'https://EXAMPLE.com/jobs/123/?utm_source=linkedin&gh_jid=123#apply';
    const second = 'https://example.com/jobs/123?gh_jid=123&utm_campaign=mail';
    expect(applicationUrlIdentity(first)).toBe(applicationUrlIdentity(second));
  });

  it('mantém identificadores diferentes e parâmetros desconhecidos distintos', () => {
    const first = 'https://example.com/jobs/123?gh_jid=123';
    const second = 'https://example.com/jobs/123?gh_jid=456';
    expect(applicationUrlIdentity(first)).not.toBe(applicationUrlIdentity(second));
    expect(applicationUrlIdentity('https://example.com/?position=1')).not.toBe(
      applicationUrlIdentity('https://example.com/?position=2'),
    );
  });

  it('não aceita URLs inválidas ou sem HTTPS', () => {
    expect(applicationUrlIdentity('not a url')).toBeNull();
    expect(applicationUrlIdentity('http://example.com/jobs/123')).toBeNull();
  });
});
