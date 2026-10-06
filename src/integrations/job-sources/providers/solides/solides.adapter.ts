import { z } from 'zod';
import type { RemoteType } from '@prisma/client';
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

const addressSchema = z
  .object({
    addressLocality: z.string().nullish(),
    addressRegion: z.string().nullish(),
    addressCountry: z
      .union([z.string(), z.object({ name: z.string().nullish() }).passthrough()])
      .nullish(),
  })
  .passthrough();

const jobLocationSchema = z
  .object({
    address: addressSchema.nullish(),
  })
  .passthrough();

const identifierSchema = z.union([
  z.string(),
  z.number(),
  z
    .object({
      value: z.union([z.string(), z.number()]).nullish(),
      name: z.string().nullish(),
    })
    .passthrough(),
]);

const salaryValueSchema = z
  .object({
    value: z.number().nullish(),
    minValue: z.number().nullish(),
    maxValue: z.number().nullish(),
    unitText: z.string().nullish(),
  })
  .passthrough();

const jobPostingSchema = z
  .object({
    '@type': z.union([z.string(), z.array(z.string())]).optional(),
    title: z.string().min(1),
    description: z.string().default(''),
    hiringOrganization: z.object({ name: z.string().min(1) }).passthrough(),
    identifier: identifierSchema.optional(),
    jobLocation: z.union([jobLocationSchema, z.array(jobLocationSchema)]).nullish(),
    jobLocationType: z.string().nullish(),
    employmentType: z.union([z.string(), z.array(z.string())]).nullish(),
    datePosted: z.string().nullish(),
    baseSalary: z
      .object({
        currency: z.string().nullish(),
        value: z.union([z.number(), salaryValueSchema]).nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const externalJobSchema = z.object({
  url: z.string().url(),
  posting: jobPostingSchema,
});

export type SolidesExternalJob = z.infer<typeof externalJobSchema>;

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function searchPageForLocation(location: string): string {
  const normalized = normalizeText(location);
  if (/\b(remoto|remote|home office|home-office)\b/.test(normalized)) {
    return 'https://vagas.solides.com.br/vagas/todas/home-office';
  }

  const knownLocations: Record<string, string> = {
    belem: 'belem-pa',
    ananindeua: 'ananindeua-pa',
  };
  const slug = knownLocations[normalized] ?? slugify(location);
  return slug
    ? `https://vagas.solides.com.br/vagas/todas/${slug}`
    : 'https://vagas.solides.com.br/vagas/todas';
}

function canonicalJobUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (!/(^|\.)vagas\.solides\.com\.br$/i.test(url.hostname)) return undefined;
    if (!/^\/vaga\/\d+(?:\/[^/?#]+)?\/?$/i.test(url.pathname)) return undefined;
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function extractJobUrls(html: string, baseUrl: string): string[] {
  const values = new Set<string>();
  const hrefPattern = /href\s*=\s*["']([^"']*\/vaga\/\d+(?:\/[^"'?#\s]+)?(?:\?[^"']*)?)["']/gi;
  for (const match of html.matchAll(hrefPattern)) {
    const url = match[1] ? canonicalJobUrl(match[1], baseUrl) : undefined;
    if (url) values.add(url);
  }

  const absolutePattern =
    /https?:\/\/[a-z0-9.-]*vagas\.solides\.com\.br\/vaga\/\d+(?:\/[a-z0-9-]+)?(?:\?[^"'<>\s]*)?/gi;
  for (const match of html.matchAll(absolutePattern)) {
    const url = canonicalJobUrl(match[0], baseUrl);
    if (url) values.add(url);
  }
  return [...values];
}

function isJobPostingType(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'jobposting';
  if (Array.isArray(value)) return value.some((item) => isJobPostingType(item));
  return false;
}

function findJobPosting(value: unknown): z.infer<typeof jobPostingSchema> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (isJobPostingType(record['@type'])) {
    const parsed = jobPostingSchema.safeParse(record);
    if (parsed.success) return parsed.data;
  }

  for (const child of Object.values(record)) {
    const found = findJobPosting(child);
    if (found) return found;
  }
  return undefined;
}

function extractJobPosting(html: string): z.infer<typeof jobPostingSchema> | undefined {
  const scriptPattern =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const posting = findJobPosting(parsed);
      if (posting) return posting;
    } catch {
      continue;
    }
  }
  return undefined;
}

function identifierValue(
  identifier: z.infer<typeof identifierSchema> | undefined,
  url: string,
): string {
  if (typeof identifier === 'string' || typeof identifier === 'number') {
    return String(identifier);
  }
  if (identifier?.value !== null && identifier?.value !== undefined) {
    return String(identifier.value);
  }
  const match = new URL(url).pathname.match(/\/vaga\/(\d+)/i);
  if (match?.[1]) return match[1];
  throw new JobSourceError(
    'Vaga da Sólides sem identificador utilizável',
    'INVALID_RESPONSE',
    false,
  );
}

function countryName(country: z.infer<typeof addressSchema>['addressCountry']): string | undefined {
  if (typeof country === 'string') return country.trim() || undefined;
  return country?.name?.trim() || undefined;
}

function firstAddress(posting: z.infer<typeof jobPostingSchema>) {
  const location = Array.isArray(posting.jobLocation)
    ? posting.jobLocation[0]
    : posting.jobLocation;
  return location?.address ?? undefined;
}

function inferRemoteType(
  posting: z.infer<typeof jobPostingSchema>,
  description: string,
): RemoteType {
  const text = normalizeText(`${posting.jobLocationType ?? ''} ${posting.title} ${description}`);
  if (/\b(telecommute|remote|remoto|home office|home-office)\b/.test(text)) return 'REMOTE';
  if (/\b(hybrid|hibrido|hibrida)\b/.test(text)) return 'HYBRID';
  if (firstAddress(posting)) return 'ONSITE';
  return 'UNSPECIFIED';
}

function inferEmploymentType(
  posting: z.infer<typeof jobPostingSchema>,
  description: string,
): string | undefined {
  const raw = Array.isArray(posting.employmentType)
    ? posting.employmentType.join(' ')
    : (posting.employmentType ?? '');
  const text = normalizeText(`${raw} ${description}`);
  if (/\bclt\b/.test(text)) return 'CLT';
  if (/\b(pj|pessoa juridica)\b/.test(text)) return 'PJ';
  if (/\b(estagio|internship|intern)\b/.test(text)) return 'ESTAGIO';
  if (/\b(full time|full-time|full_time|tempo integral)\b/.test(text)) return 'FULL_TIME';
  if (/\b(part time|part-time|part_time|meio periodo)\b/.test(text)) return 'PART_TIME';
  if (/\b(contract|contrato|temporario|temporary)\b/.test(text)) return 'CONTRACT';
  return raw.trim() ? raw.trim().replace(/[ -]+/g, '_').toUpperCase() : undefined;
}

function salaryValues(posting: z.infer<typeof jobPostingSchema>): {
  min?: number;
  max?: number;
  currency?: string;
} {
  const value = posting.baseSalary?.value;
  if (typeof value === 'number') {
    return {
      min: value,
      max: value,
      currency: posting.baseSalary?.currency ?? undefined,
    };
  }
  if (!value) return {};
  return {
    min: value.minValue ?? value.value ?? undefined,
    max: value.maxValue ?? value.value ?? undefined,
    currency: posting.baseSalary?.currency ?? undefined,
  };
}

function publishedDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export class SolidesJobSource implements JobSourceAdapter {
  readonly source = 'solides';
  readonly sourceName = 'solides';
  readonly capabilities = {
    supportsKeywordSearch: false,
    supportsLocationSearch: true,
    supportsRemoteFilter: true,
    supportsPublishedAfter: false,
    supportsPagination: false,
  };
  readonly rateLimit = { requestsPerSecond: 1, concurrency: 1 };

  constructor(
    private readonly http: JobSourceHttpClient,
    private readonly rawDataMaxBytes: number,
  ) {}

  async searchJobs(query?: JobSearchQuery): Promise<SolidesExternalJob[]> {
    const requestedLimit = Math.min(query?.limit ?? 12, 12);
    const locations = query?.locations.filter(Boolean).slice(0, 3) ?? [];
    const searchPages = locations.length
      ? [...new Set(locations.map(searchPageForLocation))]
      : ['https://vagas.solides.com.br/vagas/todas'];

    const discovered = new Set<string>();
    for (const pageUrl of searchPages) {
      const html = await this.http.getText(pageUrl, {
        source: this.sourceName,
        requestsPerSecond: this.rateLimit.requestsPerSecond,
      });
      for (const jobUrl of extractJobUrls(html, pageUrl)) {
        discovered.add(jobUrl);
        if (discovered.size >= requestedLimit * 2) break;
      }
      if (discovered.size >= requestedLimit * 2) break;
    }

    if (!discovered.size) {
      throw new JobSourceError(
        'Nenhum link de vaga reconhecível foi encontrado nas páginas públicas da Sólides',
        'INVALID_RESPONSE',
        false,
      );
    }

    const jobs: SolidesExternalJob[] = [];
    for (const url of [...discovered].slice(0, requestedLimit * 2)) {
      try {
        const html = await this.http.getText(url, {
          source: this.sourceName,
          requestsPerSecond: this.rateLimit.requestsPerSecond,
        });
        const posting = extractJobPosting(html);
        if (!posting) continue;

        const external = externalJobSchema.parse({ url, posting });
        const normalizedDescription = stripHtml(posting.description);
        const keywordMatch =
          !query?.keywords.length ||
          query.keywords.some((keyword) =>
            includesText(
              `${posting.title} ${posting.hiringOrganization.name} ${normalizedDescription}`,
              keyword,
            ),
          );
        if (!keywordMatch) continue;

        const published = publishedDate(posting.datePosted);
        if (query?.publishedAfter && published && published < query.publishedAfter) continue;

        jobs.push(external);
        if (jobs.length >= requestedLimit) break;
      } catch {
        continue;
      }
    }

    if (!jobs.length) {
      throw new JobSourceError(
        'As vagas públicas encontradas na Sólides não continham JobPosting compatível com o perfil',
        'INVALID_RESPONSE',
        false,
      );
    }
    return jobs;
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = externalJobSchema.parse(input);
    const posting = raw.posting;
    const description = stripHtml(posting.description);
    const address = firstAddress(posting);
    const city = address?.addressLocality?.trim() || undefined;
    const state = address?.addressRegion?.trim() || undefined;
    const country = countryName(address?.addressCountry);
    const remoteType = inferRemoteType(posting, description);
    const locationParts = [city, state, country].filter(Boolean) as string[];
    const location = locationParts.length
      ? locationParts.join(', ')
      : remoteType === 'REMOTE'
        ? 'Remoto'
        : undefined;
    const salary = salaryValues(posting);

    return {
      source: this.sourceName,
      externalId: identifierValue(posting.identifier, raw.url),
      title: posting.title.trim(),
      company: posting.hiringOrganization.name.trim(),
      description: description || posting.title,
      location,
      city,
      state,
      country,
      remoteType,
      employmentType: inferEmploymentType(posting, description),
      seniority: inferSeniority(`${posting.title} ${description}`),
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      applicationUrl: raw.url,
      originalUrl: raw.url,
      publishedAt: publishedDate(posting.datePosted),
      requiredCertifications: [],
      skills: extractKnownSkills(posting.title, description, []),
      rawData: safeRawData(
        {
          identifier: posting.identifier,
          jobLocationType: posting.jobLocationType,
          employmentType: posting.employmentType,
          attribution: 'Sólides Vagas',
        },
        this.rawDataMaxBytes,
      ),
    };
  }
}
