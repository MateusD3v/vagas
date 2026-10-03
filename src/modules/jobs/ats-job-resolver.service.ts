import { z } from 'zod';
import type { JobSourceHttpClient } from '../../integrations/job-sources/shared/http-client.js';
import { stripHtml } from '../../integrations/job-sources/shared/normalization.js';
import {
  classifyApplicationChannel,
  type ApplicationQuestion,
} from '../applications/application-channel.js';

const urlSchema = z.string().url();

const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  description: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  hostedUrl: z.string().url().nullish(),
  applyUrl: z.string().url().nullish(),
  workplaceType: z.string().nullish(),
  categories: z
    .object({
      location: z.string().nullish(),
      commitment: z.string().nullish(),
      team: z.string().nullish(),
      department: z.string().nullish(),
    })
    .passthrough()
    .optional(),
});

const greenhouseJobSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  content: z.string().default(''),
  absolute_url: z.string().url(),
  location: z.object({ name: z.string().nullish() }).optional(),
  updated_at: z.string().nullish(),
  questions: z
    .array(
      z
        .object({
          label: z.string().min(1),
          required: z.boolean().default(false),
          fields: z
            .array(
              z
                .object({
                  name: z.string().optional(),
                  type: z.string().optional(),
                })
                .passthrough(),
            )
            .default([]),
        })
        .passthrough(),
    )
    .default([]),
});

const greenhouseBoardSchema = z.object({
  name: z.string().min(1),
});

const ashbyPostingSchema = z.object({
  title: z.string().min(1),
  location: z.string().nullish(),
  isRemote: z.boolean().optional(),
  workplaceType: z.enum(['OnSite', 'Remote', 'Hybrid']).nullish(),
  descriptionPlain: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  publishedAt: z.string().nullish(),
  employmentType: z.enum(['FullTime', 'PartTime', 'Intern', 'Contract', 'Temporary']).nullish(),
  jobUrl: z.string().url(),
  applyUrl: z.string().url(),
});

const ashbyBoardSchema = z.object({
  apiVersion: z.string(),
  jobs: z.array(ashbyPostingSchema),
});

export interface ResolvedJobUrl {
  supported: boolean;
  platform: string;
  flow: 'ATS' | 'MANUAL' | 'FAST_APPLY';
  data?: {
    externalId?: string;
    title?: string;
    company?: string;
    description?: string;
    location?: string;
    remoteType?: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNSPECIFIED';
    employmentType?: string;
    applicationUrl: string;
    publishedAt?: string;
  };
  missingFields: string[];
  applicationQuestions?: ApplicationQuestion[];
  message?: string;
}

function remoteTypeFromText(value?: string | null): 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNSPECIFIED' {
  const text = (value ?? '').toLowerCase();
  if (text.includes('remote')) return 'REMOTE';
  if (text.includes('hybrid')) return 'HYBRID';
  if (text.includes('onsite') || text.includes('on-site') || text.includes('office'))
    return 'ONSITE';
  return 'UNSPECIFIED';
}

function canonicalPublicUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export class AtsJobResolverService {
  constructor(private readonly http: JobSourceHttpClient) {}

  async resolve(rawUrl: string): Promise<ResolvedJobUrl> {
    const applicationUrl = urlSchema.parse(rawUrl);
    const url = new URL(applicationUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const channel = classifyApplicationChannel(applicationUrl, 'manual');

    if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
      return this.resolveLever(url, channel.flow);
    }
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
      return this.resolveGreenhouse(url, channel.flow);
    }
    if (host === 'jobs.ashbyhq.com') {
      return this.resolveAshby(url, channel.flow);
    }
    if (host.includes('linkedin.com') || host.includes('indeed.com')) {
      return {
        supported: false,
        platform: channel.platform,
        flow: channel.flow,
        missingFields: ['title', 'company', 'description'],
        message:
          'LinkedIn/Indeed não oferecem um endpoint público de candidato para extrair esta vaga aqui; cole os dados visíveis da vaga e marque candidatura rápida quando aplicável.',
      };
    }

    return {
      supported: false,
      platform: channel.platform,
      flow: channel.flow,
      missingFields: ['title', 'company', 'description'],
      message: 'URL ainda não possui enriquecimento automático suportado.',
    };
  }

  private async resolveLever(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const parts = url.pathname.split('/').filter(Boolean);
    const [site, postingId] = parts;
    if (!site || !postingId) {
      return {
        supported: false,
        platform: 'LEVER',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'URL Lever sem site/posting id reconhecíveis.',
      };
    }

    const apiHost =
      url.hostname.toLowerCase() === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co';
    const endpoint = `https://${apiHost}/v0/postings/${encodeURIComponent(site)}/${encodeURIComponent(postingId)}?mode=json`;
    const raw = await this.http.getJson<unknown>(endpoint, {
      source: 'lever-resolver',
      requestsPerSecond: 1,
    });
    const job = leverPostingSchema.parse(raw);
    const description = (job.descriptionPlain ?? stripHtml(job.description ?? '')).trim();

    return {
      supported: true,
      platform: 'LEVER',
      flow: 'ATS',
      data: {
        externalId: job.id,
        title: job.text,
        description: description || job.text,
        location: job.categories?.location ?? undefined,
        remoteType: remoteTypeFromText(
          `${job.workplaceType ?? ''} ${job.categories?.location ?? ''}`,
        ),
        employmentType: job.categories?.commitment ?? undefined,
        applicationUrl: job.applyUrl ?? job.hostedUrl ?? url.toString(),
      },
      missingFields: ['company'],
      message: 'Dados públicos da vaga Lever carregados; confirme a empresa antes de importar.',
    };
  }

  private async resolveAshby(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const [boardName] = url.pathname.split('/').filter(Boolean);
    if (!boardName) {
      return {
        supported: false,
        platform: 'ASHBY',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'URL Ashby sem nome de job board reconhecível.',
      };
    }

    const endpoint = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}`;
    const raw = await this.http.getJson<unknown>(endpoint, {
      source: 'ashby-resolver',
      requestsPerSecond: 1,
    });
    const board = ashbyBoardSchema.parse(raw);
    const requested = canonicalPublicUrl(url.toString());
    const job = board.jobs.find(
      (posting) =>
        canonicalPublicUrl(posting.jobUrl) === requested ||
        canonicalPublicUrl(posting.applyUrl) === requested,
    );

    if (!job) {
      return {
        supported: false,
        platform: 'ASHBY',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'A vaga não foi localizada entre as publicações atuais desse job board Ashby.',
      };
    }

    const description = (job.descriptionPlain ?? stripHtml(job.descriptionHtml ?? '')).trim();
    return {
      supported: true,
      platform: 'ASHBY',
      flow: 'ATS',
      data: {
        title: job.title,
        description: description || job.title,
        location: job.location ?? undefined,
        remoteType: remoteTypeFromText(job.workplaceType ?? (job.isRemote ? 'Remote' : null)),
        employmentType: job.employmentType ?? undefined,
        applicationUrl: job.applyUrl,
        publishedAt: job.publishedAt ?? undefined,
      },
      missingFields: ['company'],
      message: 'Dados públicos da vaga Ashby carregados; confirme a empresa antes de importar.',
    };
  }

  private async resolveGreenhouse(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const parts = url.pathname.split('/').filter(Boolean);
    const jobsIndex = parts.findIndex((part) => part === 'jobs');
    const boardToken = jobsIndex > 0 ? parts[jobsIndex - 1] : undefined;
    const jobId = jobsIndex >= 0 ? parts[jobsIndex + 1] : undefined;
    if (!boardToken || !jobId || !/^\d+$/.test(jobId)) {
      return {
        supported: false,
        platform: 'GREENHOUSE',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'URL Greenhouse sem board token/job id reconhecíveis.',
      };
    }

    const jobEndpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(jobId)}?questions=true`;
    const boardEndpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}`;
    const [rawJob, rawBoard] = await Promise.all([
      this.http.getJson<unknown>(jobEndpoint, {
        source: 'greenhouse-resolver',
        requestsPerSecond: 1,
      }),
      this.http.getJson<unknown>(boardEndpoint, {
        source: 'greenhouse-resolver',
        requestsPerSecond: 1,
      }),
    ]);
    const job = greenhouseJobSchema.parse(rawJob);
    const board = greenhouseBoardSchema.parse(rawBoard);
    const description = stripHtml(job.content).trim();
    const location = job.location?.name ?? undefined;

    return {
      supported: true,
      platform: 'GREENHOUSE',
      flow: 'ATS',
      data: {
        externalId: String(job.id),
        title: job.title,
        company: board.name,
        description: description || job.title,
        location,
        remoteType: remoteTypeFromText(location),
        applicationUrl: job.absolute_url,
        publishedAt: job.updated_at ?? undefined,
      },
      missingFields: [],
      applicationQuestions: job.questions.map((question) => ({
        label: question.label,
        required: question.required,
        fields: question.fields.map((field) => ({
          ...(field.name ? { name: field.name } : {}),
          ...(field.type ? { type: field.type } : {}),
        })),
      })),
    };
  }
}
