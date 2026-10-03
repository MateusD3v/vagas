import type { SubmissionProvider } from './submission.interface.js';

export class SubmissionProviderRegistry {
  constructor(private readonly providers: SubmissionProvider[] = []) {}

  find(source: string, applicationUrl: string | null): SubmissionProvider | null {
    return this.providers.find((provider) => provider.supports(source, applicationUrl)) ?? null;
  }

  ids(): string[] {
    return this.providers.map((provider) => provider.id);
  }
}
