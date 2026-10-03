import { z } from 'zod';
import type {
  JobSearchQuery,
  JobSourceAdapter,
  NormalizedJob,
} from '../../job-source.interface.js';
import type { JobSourceHttpClient } from '../../shared/http-client.js';
import { JobSourceError } from '../../shared/source-errors.js';
import {
  extractKnownSkills,
  inferSeniority,
  safeRawData,
  stripHtml,
} from '../../shared/normalization.js';

const remotiveJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  url: z.string().url(),
  title: z.string().min(1),
  company_name: z.string().min(1),
  category: z.string().optional(),
  job_type: z.string().nullish(),
  publication_date: z.string(),
  candidate_required_location: z.string().nullish(),
  salary: z.string().nullish(),
  description: z.string().default(''),
});

const responseSchema = z.object({ jobs: z.array(remotiveJobSchema) });
export type RemotiveExternalJob = z.infer<typeof remotiveJobSchema>;

export class RemotiveJobSource implements JobSourceAdapter {
  readonly source = 'remotive';
  readonly sourceName = 'remotive';
  readonly capabilities = {
    supportsKeywordSearch: true,
    supportsLocationSearch: false,
    supportsRemoteFilter: true,
    supportsPublishedAfter: false,
    supportsPagination: false,
  };
  readonly rateLimit = { requestsPerSecond: 1 / 30, concurrency: 1 };

  constructor(
    private readonly http: JobSourceHttpClient,
    private readonly rawDataMaxBytes: number,
  ) {}

  async searchJobs(query?: JobSearchQuery): Promise<RemotiveExternalJob[]> {
    const url = new URL('https://remotive.com/api/remote-jobs');
    const firstKeyword = query?.keywords.find(Boolean);
    if (firstKeyword) url.searchParams.set('search', firstKeyword);
    url.searchParams.set('limit', String(Math.min(query?.limit ?? 25, 100)));
    const response = await this.http.getJson<unknown>(url.toString(), {
      source: this.sourceName,
      requestsPerSecond: this.rateLimit.requestsPerSecond,
    });
    try {
      return responseSchema.parse(response).jobs;
    } catch {
      throw new JobSourceError(
        'Schema inválido retornado pela Remotive',
        'INVALID_RESPONSE',
        false,
      );
    }
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = remotiveJobSchema.parse(input);
    const description = stripHtml(raw.description);
    return {
      source: this.sourceName,
      externalId: String(raw.id),
      title: raw.title.trim(),
      company: raw.company_name.trim(),
      description: description || raw.title,
      location: raw.candidate_required_location ?? 'Remote',
      country: raw.candidate_required_location ?? undefined,
      remoteType: 'REMOTE',
      employmentType: raw.job_type?.toUpperCase(),
      seniority: inferSeniority(raw.title),
      applicationUrl: raw.url,
      originalUrl: raw.url,
      publishedAt: new Date(raw.publication_date),
      requiredCertifications: [],
      skills: extractKnownSkills(raw.title, description),
      rawData: safeRawData(
        {
          id: raw.id,
          category: raw.category,
          jobType: raw.job_type,
          salary: raw.salary,
          candidateRequiredLocation: raw.candidate_required_location,
        },
        this.rawDataMaxBytes,
      ),
    };
  }
}
