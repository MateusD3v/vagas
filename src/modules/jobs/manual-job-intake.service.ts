import type {
  JobSourceAdapter,
  NormalizedJob,
} from '../../integrations/job-sources/job-source.interface.js';
import {
  extractKnownSkills,
  inferSeniority,
} from '../../integrations/job-sources/shared/normalization.js';
import {
  classifyApplicationChannel,
  type ApplicationChannel,
} from '../applications/application-channel.js';
import type { JobMatchingService } from '../matching/job-matching.service.js';
import type { JobIngestionService } from './job-ingestion.service.js';
import type { manualJobImportSchema } from './job.schemas.js';
import type { z } from 'zod';

type ManualJobInput = z.infer<typeof manualJobImportSchema>;

class ManualJobAdapter implements JobSourceAdapter {
  readonly source = 'manual';
  readonly sourceName = 'manual';
  readonly capabilities = {
    supportsKeywordSearch: false,
    supportsLocationSearch: false,
    supportsRemoteFilter: false,
    supportsPublishedAfter: false,
    supportsPagination: false,
  };
  readonly rateLimit = { requestsPerSecond: 1, concurrency: 1 };

  constructor(private readonly normalized: NormalizedJob) {}

  searchJobs(): Promise<unknown[]> {
    return Promise.resolve([this.normalized]);
  }

  normalizeJob(): NormalizedJob {
    return this.normalized;
  }
}

export class ManualJobIntakeService {
  constructor(
    private readonly ingestion: JobIngestionService,
    private readonly matching: JobMatchingService,
  ) {}

  async importAndAnalyze(input: ManualJobInput) {
    const channel = classifyApplicationChannel(input.applicationUrl, 'manual', input.fastApply);
    const normalized = this.normalize(input, channel);
    const ingested = await this.ingestion.ingest(new ManualJobAdapter(normalized), normalized);
    const analysis = await this.matching.analyze(ingested.job.id);

    return {
      jobId: ingested.job.id,
      inserted: ingested.inserted,
      duplicated: ingested.duplicated,
      channel,
      analysis,
    };
  }

  private normalize(input: ManualJobInput, channel: ApplicationChannel): NormalizedJob {
    return {
      source: 'manual',
      externalId: input.externalId,
      title: input.title.trim(),
      company: input.company.trim(),
      description: input.description.trim(),
      location: input.location,
      city: input.city,
      state: input.state,
      country: input.country,
      remoteType: input.remoteType,
      employmentType: input.employmentType,
      seniority: input.seniority ?? inferSeniority(input.title),
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
      salaryCurrency: input.salaryCurrency,
      applicationUrl: input.applicationUrl,
      originalUrl: input.applicationUrl,
      publishedAt: input.publishedAt,
      requiredEducationLevel: input.requiredEducationLevel,
      requiredCertifications: input.requiredCertifications,
      skills:
        input.skills.length > 0 ? input.skills : extractKnownSkills(input.title, input.description),
      rawData: {
        manualImport: true,
        fastApply: input.fastApply,
        applicationChannel: channel,
      },
    };
  }
}
