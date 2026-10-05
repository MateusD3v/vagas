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

const himalayasLocationSchema = z
  .object({
    alpha2: z.string().min(2),
    name: z.string().min(1),
    slug: z.string().min(1),
  })
  .passthrough();

const himalayasJobSchema = z
  .object({
    title: z.string().min(1),
    excerpt: z.string().nullish(),
    companyName: z.string().min(1),
    companySlug: z.string().nullish(),
    companyLogo: z.string().url().nullish(),
    employmentType: z.string().nullish(),
    minSalary: z.number().nullish(),
    maxSalary: z.number().nullish(),
    salaryPeriod: z.string().nullish(),
    seniority: z.union([z.string(), z.array(z.string())]).nullish(),
    currency: z.string().nullish(),
    locationRestrictions: z
      .array(z.union([z.string().min(1), himalayasLocationSchema]))
      .default([]),
    timezoneRestrictions: z.array(z.union([z.string(), z.number()])).default([]),
    categories: z.array(z.string()).default([]),
    parentCategories: z.array(z.string()).default([]),
    description: z.string().default(''),
    pubDate: z.union([z.string(), z.number()]),
    expiryDate: z.union([z.string(), z.number()]).nullish(),
    applicationLink: z.string().url(),
    guid: z.string().min(1),
  })
  .passthrough();

const responseSchema = z
  .object({
    jobs: z.array(himalayasJobSchema),
  })
  .passthrough();

export type HimalayasExternalJob = z.infer<typeof himalayasJobSchema>;

function publicationDate(value: string | number): Date {
  if (typeof value === 'string') return new Date(value);
  return new Date(value < 10_000_000_000 ? value * 1000 : value);
}

export class HimalayasJobSource implements JobSourceAdapter {
  readonly source = 'himalayas';
  readonly sourceName = 'himalayas';
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

  async searchJobs(query?: JobSearchQuery): Promise<HimalayasExternalJob[]> {
    const keyword = query?.keywords.find(Boolean);
    const url = new URL(
      keyword ? 'https://himalayas.app/jobs/api/search' : 'https://himalayas.app/jobs/api',
    );
    if (keyword) {
      url.searchParams.set('q', keyword);
      url.searchParams.set('sort', 'recent');
    } else {
      url.searchParams.set('limit', String(Math.min(query?.limit ?? 20, 20)));
    }

    const response = await this.http.getJson<unknown>(url.toString(), {
      source: this.sourceName,
      requestsPerSecond: this.rateLimit.requestsPerSecond,
    });

    try {
      const parsed = responseSchema.parse(response);
      return parsed.jobs.slice(0, Math.min(query?.limit ?? 20, 20));
    } catch {
      throw new JobSourceError(
        'Schema inválido retornado pela Himalayas',
        'INVALID_RESPONSE',
        false,
      );
    }
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = himalayasJobSchema.parse(input);
    const description = stripHtml(raw.description);
    const seniority = Array.isArray(raw.seniority)
      ? raw.seniority.join(' ')
      : (raw.seniority ?? '');
    const locationNames = raw.locationRestrictions.map((item) =>
      typeof item === 'string' ? item : item.name,
    );
    const location = locationNames.length ? locationNames.join(', ') : 'Worldwide';
    const annualSalary = raw.salaryPeriod?.toLowerCase() === 'annual';
    const employmentType = raw.employmentType?.replace(/[ -]+/g, '_').toUpperCase();
    const skillText = [
      description,
      raw.excerpt ?? '',
      ...raw.categories,
      ...raw.parentCategories,
    ].join(' ');

    return {
      source: this.sourceName,
      externalId: raw.guid,
      title: raw.title.trim(),
      company: raw.companyName.trim(),
      description: description || raw.excerpt || raw.title,
      location,
      country: locationNames.length === 1 ? locationNames[0] : undefined,
      remoteType: 'REMOTE',
      employmentType,
      seniority: inferSeniority(`${raw.title} ${seniority}`),
      salaryMin: annualSalary ? (raw.minSalary ?? undefined) : undefined,
      salaryMax: annualSalary ? (raw.maxSalary ?? undefined) : undefined,
      salaryCurrency: annualSalary ? (raw.currency ?? undefined) : undefined,
      applicationUrl: raw.applicationLink,
      originalUrl: raw.applicationLink,
      publishedAt: publicationDate(raw.pubDate),
      requiredCertifications: [],
      skills: extractKnownSkills(raw.title, skillText, raw.categories),
      rawData: safeRawData(
        {
          guid: raw.guid,
          companySlug: raw.companySlug,
          companyLogo: raw.companyLogo,
          employmentType: raw.employmentType,
          seniority: raw.seniority,
          locationRestrictions: raw.locationRestrictions,
          timezoneRestrictions: raw.timezoneRestrictions,
          categories: raw.categories,
          parentCategories: raw.parentCategories,
          minSalary: raw.minSalary,
          maxSalary: raw.maxSalary,
          salaryPeriod: raw.salaryPeriod,
          currency: raw.currency,
          expiryDate: raw.expiryDate,
          attribution: 'Himalayas',
        },
        this.rawDataMaxBytes,
      ),
    };
  }
}
