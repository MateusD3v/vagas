import type { JobSourceAdapter, NormalizedJob, RawJob } from '../job-source.interface.js';
import { mockJobs } from './mock.data.js';

export class MockJobSource implements JobSourceAdapter {
  readonly source = 'mock';
  readonly sourceName = 'mock';
  readonly capabilities = {
    supportsKeywordSearch: false,
    supportsLocationSearch: false,
    supportsRemoteFilter: false,
    supportsPublishedAfter: false,
    supportsPagination: false,
  };
  readonly rateLimit = { requestsPerSecond: 100, concurrency: 1 };

  async searchJobs(): Promise<RawJob[]> {
    return Promise.resolve(mockJobs);
  }

  async getJobDetails(externalId: string): Promise<RawJob | null> {
    return Promise.resolve(mockJobs.find((item) => item.externalId === externalId) ?? null);
  }

  normalizeJob(raw: unknown): NormalizedJob {
    const job = raw as RawJob;
    return { ...job, source: this.source, rawData: { ...job } };
  }
}
