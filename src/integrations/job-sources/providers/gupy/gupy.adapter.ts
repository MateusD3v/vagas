import { z } from 'zod';
import type { RemoteType } from '@prisma/client';
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

const MCP_ENDPOINT = 'https://candidates.mcp.api.gupy.io/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';

const salarySchema = z
  .object({
    status: z.string().nullish(),
    label: z.string().nullish(),
    min: z.number().nullish(),
    max: z.number().nullish(),
    confidence: z.string().nullish(),
  })
  .passthrough();

const gupyJobSchema = z
  .object({
    id: z.number().int().positive(),
    companyId: z.number().int().positive().optional(),
    name: z.string().min(1),
    description: z.string().default(''),
    careerPageName: z.string().min(1),
    type: z.string().nullish(),
    publishedDate: z.string().nullish(),
    applicationDeadline: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
    jobUrl: z.string().url(),
    workplaceType: z.string().nullish(),
    disabilities: z.boolean().nullish(),
    isConfidentialCareerPage: z.boolean().default(false),
    salary: salarySchema.nullish(),
  })
  .passthrough();

const toolPayloadSchema = z
  .object({
    data: z.object({
      data: z.array(gupyJobSchema),
      pagination: z
        .object({
          total: z.number().int().nonnegative().optional(),
          limit: z.number().int().positive().optional(),
          offset: z.number().int().nonnegative().optional(),
        })
        .passthrough()
        .optional(),
    }),
  })
  .passthrough();

const rpcEnvelopeSchema = z
  .object({
    result: z
      .object({
        content: z.array(
          z
            .object({
              type: z.string(),
              text: z.string().optional(),
            })
            .passthrough(),
        ),
        isError: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({
        code: z.number().optional(),
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type GupyExternalJob = z.infer<typeof gupyJobSchema>;

function parseSseEnvelope(input: string): unknown {
  const dataLines = input
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  const payload = dataLines.length ? dataLines.join('\n') : input.trim();
  if (!payload) {
    throw new JobSourceError('MCP da Gupy retornou resposta vazia', 'INVALID_RESPONSE', false);
  }
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new JobSourceError('MCP da Gupy retornou SSE inválido', 'INVALID_RESPONSE', false);
  }
}

function parseToolResult(input: string): GupyExternalJob[] {
  const envelope = rpcEnvelopeSchema.safeParse(parseSseEnvelope(input));
  if (!envelope.success || envelope.data.error || envelope.data.result?.isError) {
    throw new JobSourceError('MCP da Gupy retornou erro de ferramenta', 'INVALID_RESPONSE', false);
  }
  const text = envelope.data.result?.content.find(
    (item) => item.type === 'text' && item.text,
  )?.text;
  if (!text) {
    throw new JobSourceError(
      'MCP da Gupy não retornou conteúdo de vagas',
      'INVALID_RESPONSE',
      false,
    );
  }

  try {
    return toolPayloadSchema.parse(JSON.parse(text)).data.data;
  } catch {
    throw new JobSourceError(
      'Schema de vagas retornado pelo MCP da Gupy mudou',
      'INVALID_RESPONSE',
      false,
    );
  }
}

function normalizeLocation(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function requestedCities(locations: string[]): string | undefined {
  const ignored = new Set([
    'remoto',
    'remote',
    'home office',
    'home-office',
    'brasil',
    'brazil',
    'para',
    'pa',
  ]);
  const cities = locations
    .map((location) => location.trim())
    .filter((location) => location && !ignored.has(normalizeLocation(location)));
  return cities.length ? [...new Set(cities)].join(',') : undefined;
}

function requestedState(locations: string[]): string | undefined {
  const normalized = locations.map(normalizeLocation);
  if (
    normalized.some((item) =>
      ['para', 'pa', 'belem', 'ananindeua'].includes(item),
    )
  ) {
    return 'Pará';
  }
  return undefined;
}

function requestedWorkplaceTypes(remoteTypes: RemoteType[]): string | undefined {
  const mapped = remoteTypes.flatMap((type) => {
    if (type === 'REMOTE') return ['remote'];
    if (type === 'HYBRID') return ['hybrid'];
    if (type === 'ONSITE') return ['on-site'];
    return [];
  });
  const unique = [...new Set(mapped)];
  return unique.length ? unique.join(',') : undefined;
}

function requestedJobTypes(types: string[]): string | undefined {
  const mapped = types.flatMap((type) => {
    const normalized = normalizeLocation(type).replace(/[ -]+/g, '_');
    if (['clt', 'full_time', 'efetivo'].includes(normalized)) {
      return ['vacancy_type_effective'];
    }
    if (['estagio', 'intern', 'internship'].includes(normalized)) {
      return ['vacancy_type_internship'];
    }
    if (normalized === 'trainee') return ['vacancy_type_trainee'];
    if (['pj', 'pessoa_juridica'].includes(normalized)) return ['vacancy_legal_entity'];
    if (['temporario', 'temporary'].includes(normalized)) {
      return ['vacancy_type_temporary'];
    }
    if (['freelance', 'freelancer'].includes(normalized)) {
      return ['vacancy_type_freelancer'];
    }
    return [];
  });
  const unique = [...new Set(mapped)];
  return unique.length ? unique.join(',') : undefined;
}

function remoteType(value: string | null | undefined): RemoteType {
  const normalized = normalizeLocation(value ?? '');
  if (normalized === 'remote') return 'REMOTE';
  if (normalized === 'hybrid') return 'HYBRID';
  if (normalized === 'on-site' || normalized === 'on_site') return 'ONSITE';
  return 'UNSPECIFIED';
}

function employmentType(value: string | null | undefined): string | undefined {
  switch (value) {
    case 'vacancy_type_effective':
      return 'CLT';
    case 'vacancy_type_internship':
      return 'ESTAGIO';
    case 'vacancy_type_trainee':
      return 'TRAINEE';
    case 'vacancy_legal_entity':
      return 'PJ';
    case 'vacancy_type_temporary':
      return 'TEMPORARY';
    case 'vacancy_type_freelancer':
      return 'FREELANCE';
    case 'vacancy_type_apprentice':
      return 'APRENDIZ';
    default:
      return value?.trim() || undefined;
  }
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export class GupyJobSource implements JobSourceAdapter {
  readonly source = 'gupy';
  readonly sourceName = 'gupy';
  readonly capabilities = {
    supportsKeywordSearch: true,
    supportsLocationSearch: true,
    supportsRemoteFilter: true,
    supportsPublishedAfter: false,
    supportsPagination: false,
  };
  readonly rateLimit = { requestsPerSecond: 1 / 30, concurrency: 1 };

  constructor(
    private readonly http: JobSourceHttpClient,
    private readonly rawDataMaxBytes: number,
  ) {}

  async searchJobs(query?: JobSearchQuery): Promise<GupyExternalJob[]> {
    const term = query?.keywords.find(Boolean);
    const limit = Math.min(query?.limit ?? 25, 50);
    const city = requestedCities(query?.locations ?? []);
    const state = requestedState(query?.locations ?? []);
    const workplaceTypes = requestedWorkplaceTypes(query?.remoteTypes ?? []);
    const jobTypes = requestedJobTypes(query?.employmentTypes ?? []);

    const args = {
      limit,
      offset: 0,
      ...(term ? { term } : {}),
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      country: 'Brasil',
      ...(workplaceTypes ? { workplaceTypes } : {}),
      ...(jobTypes ? { jobTypes } : {}),
      sortBy: 'publishedDate',
      sortOrder: 'desc',
    };

    const response = await this.http.postText(
      MCP_ENDPOINT,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search_jobs', arguments: args },
      },
      {
        source: this.sourceName,
        requestsPerSecond: this.rateLimit.requestsPerSecond,
        headers: {
          Accept: 'application/json, text/event-stream',
          'mcp-protocol-version': MCP_PROTOCOL_VERSION,
        },
      },
    );

    const jobs = parseToolResult(response);
    const publishedAfter = query?.publishedAfter;
    const filtered = publishedAfter
      ? jobs.filter((job) => {
          const published = parseDate(job.publishedDate);
          return !published || published >= publishedAfter;
        })
      : jobs;
    return filtered.slice(0, limit);
  }

  normalizeJob(input: unknown): NormalizedJob {
    const raw = gupyJobSchema.parse(input);
    const description = stripHtml(raw.description);
    const salaryAvailable =
      raw.salary?.status === 'disclosed' || raw.salary?.status === 'range';

    return {
      source: this.sourceName,
      externalId: String(raw.id),
      title: raw.name.trim(),
      company: raw.careerPageName.trim(),
      description: description || raw.name,
      location: [raw.city, raw.state, raw.country].filter(Boolean).join(', ') || undefined,
      city: raw.city?.trim() || undefined,
      state: raw.state?.trim() || undefined,
      country: raw.country?.trim() || undefined,
      remoteType: remoteType(raw.workplaceType),
      employmentType: employmentType(raw.type),
      seniority: inferSeniority(`${raw.name} ${description}`),
      salaryMin: salaryAvailable ? (raw.salary?.min ?? undefined) : undefined,
      salaryMax: salaryAvailable ? (raw.salary?.max ?? undefined) : undefined,
      applicationUrl: raw.jobUrl,
      originalUrl: raw.jobUrl,
      publishedAt: parseDate(raw.publishedDate),
      requiredCertifications: [],
      skills: extractKnownSkills(raw.name, description, []),
      rawData: safeRawData(
        {
          companyId: raw.companyId,
          careerPageName: raw.careerPageName,
          type: raw.type,
          applicationDeadline: raw.applicationDeadline,
          workplaceType: raw.workplaceType,
          disabilities: raw.disabilities,
          isConfidentialCareerPage: raw.isConfidentialCareerPage,
          salary: raw.salary,
          attribution: 'Gupy',
          transport: 'official-candidate-mcp',
        },
        this.rawDataMaxBytes,
      ),
    };
  }
}
