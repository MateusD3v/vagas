import type { JobSourceAdapter } from './job-source.interface.js';

export class JobSourceRegistry {
  private readonly adapters = new Map<string, JobSourceAdapter>();

  register(adapter: JobSourceAdapter): this {
    if (this.adapters.has(adapter.sourceName)) {
      throw new Error(`Adapter já registrado: ${adapter.sourceName}`);
    }
    this.adapters.set(adapter.sourceName, adapter);
    return this;
  }

  getAdapter(sourceName: string): JobSourceAdapter | undefined {
    return this.adapters.get(sourceName);
  }

  listAdapters(): JobSourceAdapter[] {
    return [...this.adapters.values()];
  }

  getEnabledAdapters(enabledSlugs: string[]): JobSourceAdapter[] {
    const enabled = new Set(enabledSlugs);
    return this.listAdapters().filter((adapter) => enabled.has(adapter.sourceName));
  }
}
