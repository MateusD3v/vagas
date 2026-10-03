import { z } from 'zod';
import { includesText } from '../../../../shared/text.js';
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

const arbeitnowJobSchema = z.object({
  slug: z.string().min(1),
  company_name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  remote: z.boolean().default(false),
  url: z.string().url(),
  tags: z.array(z.string()).default([]),
  job_types: z.array(z.string()).default([]),
  location: z.string().nullish(),
  created_at: z.union([z.number(), z.string()]),
});

const responseSchema = z.object({ data: z.array(arbeitnowJobSchema) });
export type ArbeitnowExternalJob = z.infer<typeof arbeitnowJobSchema>;

export class ArbeitnowJobSource implements JobSourceAdapter {
  readonly source = 'arbeitnow';
  readonly sourceName = 'arbeitnow';
  readonly capabilities = {
    supportsKeywordSearch: false,
    supportsLocationSearch: false,
    supportsRemoteFilter: false,
    supportsPublishedAfter: false,
    supportsPagination: true,
  };
  readonly rateLimit = { requestsPerSecond: 0.5, concurrency: 1 };

  constructor(
    private readonly http: JobSourceHttpClient,
    private readonly rawDataMaxBytes: number,
  ) {}

  async searchJobs(query?: JobSearchQuery): Promise<ArbeitnowExternalJob[]> {
    const response = await this.http.getJson<unknown>(
      'https://www.arbeitnow.com/api/job-board-api',
      { source: this.sourceName, requestsPerSecond: this.rateLimit.requestsPerSecond },
    );
    let jobs: ArbeitnowExternalJob[];
    try {
      jobs = responseSchema.parse(response).data;
    } catch {
      throw new JobSourceError(
        'Schema inválido retornado pela Arbeitnow',
        'INVALID_RESPONSE',
        false,
      );
    }
    const matching = query?.keywords.length
      ? jobs.filter((job) =>
          query.keywords.some((keyword) =>
            includesText(
              `${job.title} ${stripHtml(job.description)} ${job.tags.join(' ')}`,
              keyword,
            ),
          ),
        )
      : jobs;
    return matching.slice(0, Math.min(query?.limit ?? 25, 100));
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = arbeitnowJobSchema.parse(input);
    const description = stripHtml(raw.description);
    const publishedAt =
      typeof raw.created_at === 'number'
        ? new Date(raw.created_at * 1000)
        : new Date(raw.created_at);
    return {
      source: this.sourceName,
      externalId: raw.slug,
      title: raw.title.trim(),
      company: raw.company_name.trim(),
      description: description || raw.title,
      location: raw.location ?? (raw.remote ? 'Remote' : undefined),
      country: raw.location ?? undefined,
      remoteType: raw.remote ? 'REMOTE' : 'ONSITE',
      employmentType: raw.job_types[0]?.toUpperCase(),
      seniority: inferSeniority(raw.title),
      applicationUrl: raw.url,
      originalUrl: raw.url,
      publishedAt,
      requiredCertifications: [],
      skills: extractKnownSkills(raw.title, description, raw.tags),
      rawData: safeRawData(
        { slug: raw.slug, tags: raw.tags, jobTypes: raw.job_types, remote: raw.remote },
        this.rawDataMaxBytes,
      ),
    };
  }
}
