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

const parsedItemSchema = z.object({
  title: z.string().min(1),
  link: z.string().url(),
  guid: z.string().min(1),
  pubDate: z.string().min(1),
  description: z.string().default(''),
  region: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  skills: z.string().optional(),
  expiresAt: z.string().optional(),
  creator: z.string().optional(),
});

type ParsedWwrItem = z.infer<typeof parsedItemSchema>;

export interface WeWorkRemotelyExternalJob extends ParsedWwrItem {
  company: string;
  position: string;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, encoded: string) =>
      String.fromCodePoint(Number.parseInt(encoded, 16)),
    )
    .replace(/&#(\d+);/g, (_, encoded: string) =>
      String.fromCodePoint(Number.parseInt(encoded, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function extractTag(xml: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const pattern = '<' + escapedTag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + escapedTag + '>';
  const match = xml.match(new RegExp(pattern, 'i'));
  return match?.[1] ? decodeXmlEntities(match[1]) : undefined;
}

function parseTitle(rawTitle: string, creator?: string): { company: string; position: string } | undefined {
  const title = rawTitle.trim();
  const separator = title.indexOf(': ');
  if (separator > 0 && separator < title.length - 2) {
    return {
      company: title.slice(0, separator).trim(),
      position: title.slice(separator + 2).trim(),
    };
  }
  if (creator?.trim()) {
    return { company: creator.trim(), position: title };
  }
  return undefined;
}

function parseFeed(xml: string): WeWorkRemotelyExternalJob[] {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new JobSourceError(
      'RSS inválido retornado pela We Work Remotely',
      'INVALID_RESPONSE',
      false,
    );
  }

  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  if (!blocks.length) return [];

  const jobs: WeWorkRemotelyExternalJob[] = [];
  for (const block of blocks) {
    const raw = {
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      guid: extractTag(block, 'guid'),
      pubDate: extractTag(block, 'pubDate'),
      description: extractTag(block, 'description') ?? '',
      region: extractTag(block, 'region'),
      country: extractTag(block, 'country'),
      state: extractTag(block, 'state'),
      category: extractTag(block, 'category'),
      type: extractTag(block, 'type'),
      skills: extractTag(block, 'skills'),
      expiresAt: extractTag(block, 'expires_at'),
      creator: extractTag(block, 'dc:creator'),
    };
    const parsed = parsedItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const title = parseTitle(parsed.data.title, parsed.data.creator);
    if (!title?.company || !title.position) continue;
    jobs.push({ ...parsed.data, ...title });
  }

  if (!jobs.length) {
    throw new JobSourceError(
      'Nenhuma vaga válida encontrada no RSS da We Work Remotely',
      'INVALID_RESPONSE',
      false,
    );
  }
  return jobs;
}

function inferEmploymentType(value?: string): string | undefined {
  if (!value) return undefined;
  const text = normalizeText(value);
  if (/\b(full[ _-]?time)\b/.test(text)) return 'FULL_TIME';
  if (/\b(part[ _-]?time)\b/.test(text)) return 'PART_TIME';
  if (/\b(intern|internship)\b/.test(text)) return 'INTERNSHIP';
  if (/\b(contract|contractor|freelance|freelancer)\b/.test(text)) return 'CONTRACT';
  if (/\b(temporary|temp)\b/.test(text)) return 'TEMPORARY';
  return undefined;
}

export class WeWorkRemotelyJobSource implements JobSourceAdapter {
  readonly source = 'weworkremotely';
  readonly sourceName = 'weworkremotely';
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

  async searchJobs(query?: JobSearchQuery): Promise<WeWorkRemotelyExternalJob[]> {
    const xml = await this.http.getText('https://weworkremotely.com/remote-jobs.rss', {
      source: this.sourceName,
      requestsPerSecond: this.rateLimit.requestsPerSecond,
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
    });
    const jobs = parseFeed(xml);
    const matching = query?.keywords.length
      ? jobs.filter((job) =>
          query.keywords.some((keyword) =>
            includesText(
              [
                job.position,
                job.company,
                stripHtml(job.description),
                job.skills ?? '',
                job.category ?? '',
              ].join(' '),
              keyword,
            ),
          ),
        )
      : jobs;
    return matching.slice(0, Math.min(query?.limit ?? 25, 100));
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = z
      .object({
        ...parsedItemSchema.shape,
        company: z.string().min(1),
        position: z.string().min(1),
      })
      .parse(input);
    const description = stripHtml(raw.description);
    const locations = [raw.region, raw.country, raw.state].filter(
      (value): value is string => Boolean(value?.trim()),
    );
    const skillTags = raw.skills
      ? raw.skills
          .split(/[,|]/)
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    return {
      source: this.sourceName,
      externalId: raw.guid,
      title: raw.position.trim(),
      company: raw.company.trim(),
      description: description || raw.position,
      location: locations.join(', ') || 'Remote',
      country: raw.country ?? undefined,
      state: raw.state ?? undefined,
      remoteType: 'REMOTE',
      employmentType: inferEmploymentType(raw.type),
      seniority: inferSeniority(raw.position + ' ' + (raw.skills ?? '')),
      applicationUrl: raw.link,
      originalUrl: raw.link,
      publishedAt: new Date(raw.pubDate),
      requiredCertifications: [],
      skills: extractKnownSkills(raw.position, description, skillTags),
      rawData: safeRawData(
        {
          category: raw.category,
          type: raw.type,
          skills: raw.skills,
          region: raw.region,
          country: raw.country,
          state: raw.state,
          expiresAt: raw.expiresAt,
          attribution: 'We Work Remotely',
        },
        this.rawDataMaxBytes,
      ),
    };
  }
}
