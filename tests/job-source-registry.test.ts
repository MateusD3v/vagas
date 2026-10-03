import { describe, expect, it } from 'vitest';
import { MockJobSource } from '../src/integrations/job-sources/mock/mock.adapter.js';
import { JobSourceRegistry } from '../src/integrations/job-sources/job-source.registry.js';

describe('JobSourceRegistry', () => {
  it('registra, lista e seleciona adapters habilitados', () => {
    const registry = new JobSourceRegistry().register(new MockJobSource());
    expect(registry.getAdapter('mock')).toBeInstanceOf(MockJobSource);
    expect(registry.listAdapters()).toHaveLength(1);
    expect(registry.getEnabledAdapters(['mock'])).toHaveLength(1);
    expect(registry.getEnabledAdapters(['disabled'])).toHaveLength(0);
  });

  it('recusa slugs duplicados', () => {
    const registry = new JobSourceRegistry().register(new MockJobSource());
    expect(() => registry.register(new MockJobSource())).toThrow(/já registrado/);
  });
});
