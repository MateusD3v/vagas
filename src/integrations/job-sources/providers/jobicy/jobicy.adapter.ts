import { z } from 'zod';
import type {
  ExternalJobStatusResult,
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

const jobicyJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  url: z.string().url(),
  jobTitle: z.string().min(1),
  companyName: z.string().min(1),
  companyLogo: z.string().url().nullish(),
  jobIndustry: z.array(z.string()).default([]),
  jobType: z.array(z.string()).default([]),
  jobGeo: z.string().nullish(),
  jobLevel: z.string().nullish(),
  jobExcerpt: z.string().nullish(),
  jobDescription: z.string().default(''),
  pubDate: z.string(),
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
});

const responseSchema = z.object({
  success: z.boolean().optional(),
  jobs: z.array(jobicyJobSchema),
  nextCursor: z.string().nullish().optional(),
  hasMore: z.boolean().optional(),
});

const statusResponseSchema = z.object({
  success: z.boolean().optional(),
  jobs: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      status: z.enum(['active', 'closed', 'unknown']),
    }),
  ),
});

const MAX_PAGES_PER_RUN = 3;
export type JobicyExternalJob = z.infer<typeof jobicyJobSchema>;

export class JobicyJobSource implements JobSourceAdapter {
  readonly source = 'jobicy';
  readonly sourceName = 'jobicy';
  readonly capabilities = {
    supportsKeywordSearch: true,
    supportsLocationSearch: false,
    supportsRemoteFilter: true,
    supportsPublishedAfter: false,
    supportsPagination: true,
  };
  readonly rateLimit = { requestsPerSecond: 1 / 30, concurrency: 1 };

  constructor(
    private readonly http: JobSourceHttpClient,
    private readonly rawDataMaxBytes: number,
  ) {}

  async searchJobs(query?: JobSearchQuery): Promise<JobicyExternalJob[]> {
    const limit = Math.min(query?.limit ?? 25, 200);
    const jobs: JobicyExternalJob[] = [];
    const seen = new Set<string>();
    const keyword = query?.keywords.find(Boolean);
    let cursor: string | null = null;
    let page = 0;

    do {
      const url = new URL('https://jobicy.com/api/v2/remote-jobs');
      url.searchParams.set('count', String(Math.min(Math.max(limit - jobs.length, 1), 200)));
      if (keyword) url.searchParams.set('tag', keyword);
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await this.http.getJson<unknown>(url.toString(), {
        source: this.sourceName,
        requestsPerSecond: this.rateLimit.requestsPerSecond,
      });

      let parsed: z.infer<typeof responseSchema>;
      try {
        parsed = responseSchema.parse(response);
      } catch {
        throw new JobSourceError(
          'Schema inválido retornado pela Jobicy',
          'INVALID_RESPONSE',
          false,
        );
      }

      for (const job of parsed.jobs) {
        const id = String(job.id);
        if (seen.has(id)) continue;
        seen.add(id);
        jobs.push(job);
        if (jobs.length >= limit) break;
      }

      cursor = parsed.nextCursor ?? null;
      page += 1;
    } while (cursor && jobs.length < limit && page < MAX_PAGES_PER_RUN);

    return jobs.slice(0, limit);
  }

  async checkJobStatuses(externalIds: string[]): Promise<ExternalJobStatusResult[]> {
    const validIds = [...new Set(externalIds.filter((id) => /^\d+$/.test(id)))];
    const results: ExternalJobStatusResult[] = [];

    for (let offset = 0; offset < validIds.length; offset += 100) {
      const batch = validIds.slice(offset, offset + 100);
      if (!batch.length) continue;
      const url = new URL('https://jobicy.com/api/v2/remote-jobs/status');
      url.searchParams.set('ids', batch.join(','));
      const response = await this.http.getJson<unknown>(url.toString(), {
        source: this.sourceName,
        requestsPerSecond: this.rateLimit.requestsPerSecond,
      });

      let parsed: z.infer<typeof statusResponseSchema>;
      try {
        parsed = statusResponseSchema.parse(response);
      } catch {
        throw new JobSourceError(
          'Schema inválido retornado pelo status da Jobicy',
          'INVALID_RESPONSE',
          false,
        );
      }

      results.push(
        ...parsed.jobs.map((job) => ({
          externalId: String(job.id),
          status:
            job.status === 'active'
              ? ('ACTIVE' as const)
              : job.status === 'closed'
                ? ('CLOSED' as const)
                : ('UNKNOWN' as const),
        })),
      );
    }

    return results;
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = jobicyJobSchema.parse(input);
    const description = stripHtml(raw.jobDescription);
    const skillText = [raw.jobTitle, description, raw.jobExcerpt ?? '', ...raw.jobIndustry].join(
      ' ',
    );
    const jobType = raw.jobType[0]?.replace(/[ -]+/g, '_').toUpperCase();

    return {
      source: this.sourceName,
      externalId: String(raw.id),
      title: raw.jobTitle.trim(),
      company: raw.companyName.trim(),
      description: description || raw.jobExcerpt || raw.jobTitle,
      location: raw.jobGeo ?? 'Remote',
      country: undefined,
      remoteType: 'REMOTE',
      employmentType: jobType,
      seniority: inferSeniority(`${raw.jobTitle} ${raw.jobLevel ?? ''}`),
      salaryMin: raw.salaryMin ?? undefined,
      salaryMax: raw.salaryMax ?? undefined,
      salaryCurrency: raw.salaryCurrency ?? undefined,
      applicationUrl: raw.url,
      originalUrl: raw.url,
      publishedAt: new Date(raw.pubDate),
      requiredCertifications: [],
      skills: extractKnownSkills(raw.jobTitle, skillText, raw.jobIndustry),
      rawData: safeRawData(
        {
          id: raw.id,
          jobIndustry: raw.jobIndustry,
          jobType: raw.jobType,
          jobGeo: raw.jobGeo,
          jobLevel: raw.jobLevel,
          salaryPeriod: raw.salaryPeriod,
          companyLogo: raw.companyLogo,
        },
        this.rawDataMaxBytes,
      ),
    };
  }
}
