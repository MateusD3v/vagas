import { z } from 'zod';
import { includesText, normalizeText } from '../../../../shared/text.js';
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

const remoteOkMetadataSchema = z
  .object({
    last_updated: z.union([z.number(), z.string()]).optional(),
    legal: z.string().min(1),
  })
  .passthrough();

const remoteOkJobSchema = z
  .object({
    slug: z.string().default(''),
    id: z.union([z.string(), z.number()]),
    epoch: z.number().nullish(),
    date: z.string().nullish(),
    company: z.string().min(1),
    company_logo: z.string().nullish(),
    position: z.string().min(1),
    tags: z.array(z.string()).default([]),
    description: z.string().default(''),
    location: z.string().nullish(),
    salary_min: z.number().nullish(),
    salary_max: z.number().nullish(),
    apply_url: z.string().url(),
    original: z.boolean().optional(),
    logo: z.string().nullish(),
    url: z.string().url(),
  })
  .passthrough();

export type RemoteOkExternalJob = z.infer<typeof remoteOkJobSchema>;

function inferEmploymentType(tags: string[]): string | undefined {
  const text = normalizeText(tags.join(' '));
  if (/\b(full[ _-]?time)\b/.test(text)) return 'FULL_TIME';
  if (/\b(part[ _-]?time)\b/.test(text)) return 'PART_TIME';
  if (/\b(intern|internship)\b/.test(text)) return 'INTERNSHIP';
  if (/\b(contract|contractor|freelance|freelancer)\b/.test(text)) return 'CONTRACT';
  if (/\b(temporary|temp)\b/.test(text)) return 'TEMPORARY';
  return undefined;
}

function publicationDate(raw: RemoteOkExternalJob): Date | undefined {
  if (raw.date) {
    const value = new Date(raw.date);
    if (!Number.isNaN(value.getTime())) return value;
  }
  if (raw.epoch) return new Date(raw.epoch * 1000);
  return undefined;
}

export class RemoteOkJobSource implements JobSourceAdapter {
  readonly source = 'remoteok';
  readonly sourceName = 'remoteok';
  readonly capabilities = {
    supportsKeywordSearch: false,
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

  async searchJobs(query?: JobSearchQuery): Promise<RemoteOkExternalJob[]> {
    const response = await this.http.getJson<unknown>('https://remoteok.com/api', {
      source: this.sourceName,
      requestsPerSecond: this.rateLimit.requestsPerSecond,
    });

    let items: unknown[];
    try {
      items = z.array(z.unknown()).parse(response);
    } catch {
      throw new JobSourceError(
        'Schema inválido retornado pela Remote OK',
        'INVALID_RESPONSE',
        false,
      );
    }
    if (items.length && remoteOkMetadataSchema.safeParse(items[0]).success) items.shift();

    let jobs: RemoteOkExternalJob[];
    try {
      jobs = z.array(remoteOkJobSchema).parse(items);
    } catch {
      throw new JobSourceError(
        'Schema inválido retornado pela Remote OK',
        'INVALID_RESPONSE',
        false,
      );
    }

    const matching = query?.keywords.length
      ? jobs.filter((job) =>
          query.keywords.some((keyword) =>
            includesText(
              `${job.position} ${job.company} ${job.tags.join(' ')} ${stripHtml(job.description)}`,
              keyword,
            ),
          ),
        )
      : jobs;

    return matching.slice(0, Math.min(query?.limit ?? 25, 100));
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = remoteOkJobSchema.parse(input);
    const description = stripHtml(raw.description);
    const salaryMin = raw.salary_min && raw.salary_min > 0 ? raw.salary_min : undefined;
    const salaryMax = raw.salary_max && raw.salary_max > 0 ? raw.salary_max : undefined;

    return {
      source: this.sourceName,
      externalId: String(raw.id),
      title: raw.position.trim(),
      company: raw.company.trim(),
      description: description || raw.position,
      location: raw.location?.trim() || 'Remote',
      remoteType: 'REMOTE',
      employmentType: inferEmploymentType(raw.tags),
      seniority: inferSeniority(`${raw.position} ${raw.tags.join(' ')}`),
      salaryMin,
      salaryMax,
      applicationUrl: raw.apply_url,
      originalUrl: raw.url,
      publishedAt: publicationDate(raw),
      requiredCertifications: [],
      skills: extractKnownSkills(raw.position, description, raw.tags),
      rawData: safeRawData(
        {
          slug: raw.slug,
          tags: raw.tags,
          applyUrl: raw.apply_url,
          original: raw.original,
          companyLogo: raw.company_logo || raw.logo,
          attribution: 'Remote OK',
        },
        this.rawDataMaxBytes,
      ),
    };
  }
}
