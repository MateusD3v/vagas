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

const responseSchema = z.object({
  data: z.array(arbeitnowJobSchema),
  links: z
    .object({
      next: z.string().url().nullable().optional(),
    })
    .optional(),
});

const MAX_PAGES_PER_RUN = 5;
export type ArbeitnowExternalJob = z.infer<typeof arbeitnowJobSchema>;

function inferEmploymentType(jobTypes: string[]): string | undefined {
  const normalized = jobTypes.map((value) => normalizeText(value));
  const mappings: Array<[RegExp, string]> = [
    [/\b(full[ _-]?time)\b/, 'FULL_TIME'],
    [/\b(part[ _-]?time)\b/, 'PART_TIME'],
    [/\b(intern|internship|working student|student)\b/, 'INTERNSHIP'],
    [/\b(contract|contractor|freelance|freelancer)\b/, 'CONTRACT'],
    [/\b(temporary|temp)\b/, 'TEMPORARY'],
  ];

  for (const [pattern, value] of mappings) {
    if (normalized.some((item) => pattern.test(item))) return value;
  }
  return undefined;
}

function inferArbeitnowSeniority(raw: ArbeitnowExternalJob): string | undefined {
  const titleSeniority = inferSeniority(raw.title);
  if (titleSeniority) return titleSeniority;

  const metadata = normalizeText([...raw.job_types, ...raw.tags].join(' '));
  if (/\b(intern|internship|working student|student)\b/.test(metadata)) return 'INTERN';
  if (/\b(entry|entry level|junior|jr|graduate)\b/.test(metadata)) return 'JUNIOR';
  if (/\b(senior|sr|staff|principal|lead)\b/.test(metadata)) return 'SENIOR';
  if (/\b(experienced|mid|midlevel|mid level|intermediate|pleno)\b/.test(metadata)) {
    return 'MID';
  }
  return undefined;
}

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
    const limit = Math.min(query?.limit ?? 25, 100);
    const matching: ArbeitnowExternalJob[] = [];
    const seenSlugs = new Set<string>();
    let nextUrl: string | null = 'https://www.arbeitnow.com/api/job-board-api?page=1';
    let page = 0;

    while (nextUrl && matching.length < limit && page < MAX_PAGES_PER_RUN) {
      page += 1;
      const response = await this.http.getJson<unknown>(nextUrl, {
        source: this.sourceName,
        requestsPerSecond: this.rateLimit.requestsPerSecond,
      });
      let parsed: z.infer<typeof responseSchema>;
      try {
        parsed = responseSchema.parse(response);
      } catch {
        throw new JobSourceError(
          'Schema inválido retornado pela Arbeitnow',
          'INVALID_RESPONSE',
          false,
        );
      }

      const pageMatches = query?.keywords.length
        ? parsed.data.filter((job) =>
            query.keywords.some((keyword) =>
              includesText(
                `${job.title} ${stripHtml(job.description)} ${job.tags.join(' ')}`,
                keyword,
              ),
            ),
          )
        : parsed.data;

      for (const job of pageMatches) {
        if (seenSlugs.has(job.slug)) continue;
        seenSlugs.add(job.slug);
        matching.push(job);
        if (matching.length >= limit) break;
      }
      nextUrl = parsed.links?.next ?? null;
    }

    return matching.slice(0, limit);
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
      employmentType: inferEmploymentType(raw.job_types),
      seniority: inferArbeitnowSeniority(raw),
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
