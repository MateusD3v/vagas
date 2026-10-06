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
                  values: z
                    .array(
                      z
                        .object({
                          label: z.string(),
                          value: z.union([z.string(), z.number()]).optional(),
                        })
                        .passthrough(),
                    )
                    .optional(),
                })
                .passthrough(),
            )
            .default([]),
        })
        .passthrough(),
    )
    .default([]),
  location_questions: z
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
                  values: z
                    .array(
                      z
                        .object({
                          label: z.string(),
                          value: z.union([z.string(), z.number()]).optional(),
                        })
                        .passthrough(),
                    )
                    .optional(),
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

const smartRecruitersSectionSchema = z
  .object({
    title: z.string().nullish(),
    text: z.string().nullish(),
  })
  .passthrough();

const smartRecruitersPostingSchema = z
  .object({
    id: z.string(),
    uuid: z.string().nullish(),
    name: z.string().min(1),
    company: z
      .object({
        name: z.string().min(1),
        identifier: z.string().nullish(),
      })
      .passthrough()
      .optional(),
    location: z
      .object({
        city: z.string().nullish(),
        region: z.string().nullish(),
        country: z.string().nullish(),
        remote: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    experienceLevel: z.object({ label: z.string().nullish() }).passthrough().nullish(),
    typeOfEmployment: z.object({ label: z.string().nullish() }).passthrough().nullish(),
    postingUrl: z.string().url().nullish(),
    applyUrl: z.string().url().nullish(),
    releasedDate: z.string().nullish(),
    jobAd: z
      .object({
        sections: z
          .object({
            companyDescription: smartRecruitersSectionSchema.optional(),
            jobDescription: smartRecruitersSectionSchema.optional(),
            qualifications: smartRecruitersSectionSchema.optional(),
            additionalInformation: smartRecruitersSectionSchema.optional(),
          })
          .partial()
          .optional(),
      })
      .passthrough()
      .optional(),
    active: z.boolean().optional(),
  })
  .passthrough();

const recruiteeLocationSchema = z
  .object({
    name: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
  })
  .passthrough();

const recruiteeOfferSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    guid: z.string().nullish(),
    title: z.string().min(1),
    slug: z.string().min(1),
    company_name: z.string().nullish(),
    description: z.string().nullish(),
    requirements: z.string().nullish(),
    location: z.string().nullish(),
    locations: z.array(recruiteeLocationSchema).default([]),
    remote: z.boolean().nullish(),
    hybrid: z.boolean().nullish(),
    on_site: z.boolean().nullish(),
    employment_type_code: z.string().nullish(),
    published_at: z.string().nullish(),
    careers_url: z.string().url().nullish(),
    careers_apply_url: z.string().url().nullish(),
  })
  .passthrough();

const recruiteeFeedSchema = z.object({
  offers: z.array(recruiteeOfferSchema),
});

const workableJobSchema = z
  .object({
    title: z.string().min(1),
    code: z.string().nullish(),
    shortcode: z.string().min(1),
    country: z.string().nullish(),
    state: z.string().nullish(),
    city: z.string().nullish(),
    department: z.string().nullish(),
    telecommuting: z.boolean().nullish(),
    published_on: z.string().nullish(),
    url: z.string().url().nullish(),
    application_url: z.string().url().nullish(),
    shortlink: z.string().url().nullish(),
    created_at: z.string().nullish(),
    description: z.string().nullish(),
    employment_type: z.string().nullish(),
    workplace_type: z.enum(['on_site', 'hybrid', 'remote']).nullish(),
  })
  .passthrough();

const workableAccountSchema = z
  .object({
    name: z.string().min(1),
    jobs: z.array(workableJobSchema),
  })
  .passthrough();

const pinpointNamedResourceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

const pinpointPostingSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullish(),
    key_responsibilities: z.string().nullish(),
    skills_knowledge_expertise: z.string().nullish(),
    benefits: z.string().nullish(),
    employment_type: z.string().nullish(),
    employment_type_text: z.string().nullish(),
    workplace_type: z.string().nullish(),
    workplace_type_text: z.string().nullish(),
    compensation_visible: z.boolean().nullish(),
    compensation_minimum: z.number().nullish(),
    compensation_maximum: z.number().nullish(),
    compensation_currency: z.string().nullish(),
    compensation_frequency: z.string().nullish(),
    deadline_at: z.string().nullish(),
    created_at: z.string().nullish(),
    url: z.string().url(),
    application_form_url: z.string().url().nullish(),
    path: z.string().min(1).nullish(),
    location: pinpointNamedResourceSchema.nullish(),
    department: pinpointNamedResourceSchema.nullish(),
    division: pinpointNamedResourceSchema.nullish(),
    job: z
      .object({
        id: z.string().min(1),
        requisition_id: z.string().nullish(),
        department: pinpointNamedResourceSchema.nullish(),
        division: pinpointNamedResourceSchema.nullish(),
        structure_custom_group_one: pinpointNamedResourceSchema.nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const pinpointFeedSchema = z.object({
  data: z.array(pinpointPostingSchema),
});

const breezyCountrySchema = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1) }).passthrough(),
]);

const breezyPostalAddressSchema = z
  .object({
    addressCountry: breezyCountrySchema.nullish(),
    addressRegion: z.string().nullish(),
    addressLocality: z.string().nullish(),
  })
  .passthrough();

const breezyPlaceSchema = z
  .object({
    address: breezyPostalAddressSchema.nullish(),
  })
  .passthrough();

const breezyLocationRequirementSchema = z
  .object({
    name: z.string().nullish(),
  })
  .passthrough();

const breezyJobPostingSchema = z
  .object({
    '@type': z.literal('JobPosting'),
    title: z.string().min(1),
    description: z.string().default(''),
    datePosted: z.string().nullish(),
    employmentType: z.union([z.string(), z.array(z.string())]).nullish(),
    hiringOrganization: z
      .object({
        name: z.string().min(1),
      })
      .passthrough()
      .nullish(),
    jobLocation: z.union([breezyPlaceSchema, z.array(breezyPlaceSchema)]).nullish(),
    applicantLocationRequirements: z
      .union([breezyLocationRequirementSchema, z.array(breezyLocationRequirementSchema)])
      .nullish(),
    jobLocationType: z.string().nullish(),
    url: z.string().url().nullish(),
  })
  .passthrough();

const genericJobPostingSchema = z
  .object({
    '@type': z.union([z.literal('JobPosting'), z.array(z.string())]),
    title: z.string().min(1),
    description: z.string().default(''),
    datePosted: z.string().nullish(),
    employmentType: z.union([z.string(), z.array(z.string())]).nullish(),
    hiringOrganization: z
      .object({
        name: z.string().min(1),
      })
      .passthrough()
      .nullish(),
    jobLocation: z.union([breezyPlaceSchema, z.array(breezyPlaceSchema)]).nullish(),
    applicantLocationRequirements: z
      .union([breezyLocationRequirementSchema, z.array(breezyLocationRequirementSchema)])
      .nullish(),
    jobLocationType: z.string().nullish(),
    url: z.string().url().nullish(),
  })
  .passthrough();

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
  if (
    text.includes('onsite') ||
    text.includes('on-site') ||
    text.includes('on_site') ||
    text.includes('on site') ||
    text.includes('office')
  )
    return 'ONSITE';
  return 'UNSPECIFIED';
}

function canonicalPublicUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
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

function validXmlTag(tag: string): boolean {
  return /^[A-Za-z][A-Za-z0-9:_-]*$/.test(tag);
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  if (!validXmlTag(tag)) return undefined;
  const pattern = '<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>';
  const match = xml.match(new RegExp(pattern, 'i'));
  return match?.[1] ? decodeXmlEntities(match[1]) : undefined;
}

function extractXmlBlocks(xml: string, tag: string): string[] {
  if (!validXmlTag(tag)) return [];
  const pattern = '<' + tag + '(?:\\s[^>]*)?>[\\s\\S]*?<\\/' + tag + '>';
  return xml.match(new RegExp(pattern, 'gi')) ?? [];
}

function extractJsonLdValues(html: string): unknown[] {
  const pattern = new RegExp(
    '<script\\b[^>]*type=["\']application/ld\\+json["\'][^>]*>([\\s\\S]*?)</script>',
    'gi',
  );
  const values: unknown[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    try {
      const parsed: unknown = JSON.parse(match[1] ?? '');
      if (Array.isArray(parsed)) {
        values.push(...(parsed as unknown[]));
        continue;
      }
      if (parsed && typeof parsed === 'object') {
        const graph = (parsed as { '@graph'?: unknown })['@graph'];
        if (Array.isArray(graph)) values.push(...(graph as unknown[]));
        values.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return values;
}

function breezyCountryName(value: z.infer<typeof breezyCountrySchema> | null | undefined): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value.name;
}

function breezyPlaceName(value: z.infer<typeof breezyPlaceSchema> | undefined): string {
  const address = value?.address;
  if (!address) return '';
  return [address.addressLocality, address.addressRegion, breezyCountryName(address.addressCountry)]
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

function breezyApplicantLocations(
  value:
    | z.infer<typeof breezyLocationRequirementSchema>
    | Array<z.infer<typeof breezyLocationRequirementSchema>>
    | null
    | undefined,
): string {
  if (!value) return '';
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => item.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(', ');
}

function genericJobPosting(values: unknown[]): z.infer<typeof genericJobPostingSchema> | undefined {
  for (const value of values) {
    const parsed = genericJobPostingSchema.safeParse(value);
    if (!parsed.success) continue;
    const type = parsed.data['@type'];
    if (typeof type === 'string' || type.includes('JobPosting')) return parsed.data;
  }
  return undefined;
}

function jobPostingLocation(posting: z.infer<typeof genericJobPostingSchema>): string | undefined {
  const requirements = breezyApplicantLocations(posting.applicantLocationRequirements);
  const locations = posting.jobLocation
    ? (Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation])
        .map((item) => breezyPlaceName(item))
        .filter(Boolean)
        .join(', ')
    : '';
  return requirements || locations || undefined;
}

function normalizedEmploymentType(value: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(value)) return value.filter(Boolean).join(' / ') || undefined;
  return value?.trim() || undefined;
}

function publishedIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
    if (host === 'jobs.smartrecruiters.com') {
      return this.resolveSmartRecruiters(url, channel.flow);
    }
    if (host.endsWith('.recruitee.com')) {
      return this.resolveRecruitee(url, channel.flow);
    }
    if (
      host === 'apply.workable.com' ||
      (host.endsWith('.workable.com') && host !== 'api.workable.com')
    ) {
      return this.resolveWorkable(url, channel.flow);
    }
    if (host.endsWith('.jobs.personio.de')) {
      return this.resolvePersonio(url, channel.flow);
    }
    if (host.endsWith('.pinpointhq.com')) {
      return this.resolvePinpoint(url, channel.flow);
    }
    if (host.endsWith('.breezy.hr')) {
      return this.resolveBreezy(url, channel.flow);
    }
    if (
      host === 'linkedin.com' ||
      host.endsWith('.linkedin.com') ||
      host === 'indeed.com' ||
      host.endsWith('.indeed.com') ||
      host === 'glassdoor.com' ||
      host.endsWith('.glassdoor.com') ||
      host === 'glassdoor.com.br' ||
      host.endsWith('.glassdoor.com.br')
    ) {
      return this.resolvePublicPortalJobPosting(url, channel.platform, channel.flow);
    }

    return {
      supported: false,
      platform: channel.platform,
      flow: channel.flow,
      missingFields: ['title', 'company', 'description'],
      message: 'URL ainda não possui enriquecimento automático suportado.',
    };
  }

  private async resolvePublicPortalJobPosting(
    url: URL,
    platform: string,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    let html: string;
    try {
      html = await this.http.getText(url.toString(), {
        source: `${platform.toLowerCase()}-manual-resolver`,
        requestsPerSecond: 0.2,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch {
      return {
        supported: false,
        platform,
        flow,
        missingFields: ['title', 'company', 'description'],
        message:
          'A página pública não pôde ser lida sem autenticação; cole os dados visíveis da vaga manualmente.',
      };
    }

    const posting = genericJobPosting(extractJsonLdValues(html));
    if (!posting) {
      return {
        supported: false,
        platform,
        flow,
        missingFields: ['title', 'company', 'description'],
        message:
          'A página pública não expôs metadados JobPosting utilizáveis; cole os dados visíveis da vaga manualmente.',
      };
    }

    const description = stripHtml(posting.description).trim();
    const company = posting.hiringOrganization?.name?.trim() || undefined;
    const location = jobPostingLocation(posting);
    const remoteType = remoteTypeFromText(
      `${posting.jobLocationType ?? ''} ${location ?? ''} ${posting.title} ${description}`,
    );
    const missingFields = [
      ...(company ? [] : ['company']),
      ...(description ? [] : ['description']),
    ];

    return {
      supported: true,
      platform,
      flow,
      data: {
        title: posting.title.trim(),
        ...(company ? { company } : {}),
        description: description || posting.title.trim(),
        ...(location ? { location } : {}),
        remoteType,
        employmentType: normalizedEmploymentType(posting.employmentType),
        applicationUrl: posting.url ?? url.toString(),
        publishedAt: publishedIso(posting.datePosted),
      },
      missingFields,
      message:
        'Metadados públicos da vaga carregados. Revise os campos antes de importar e enviar qualquer candidatura.',
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

  private async resolveSmartRecruiters(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const [companyIdentifier, postingSegment] = url.pathname.split('/').filter(Boolean);
    const postingId = postingSegment?.split('-')[0];
    if (!companyIdentifier || !postingId) {
      return {
        supported: false,
        platform: 'SMARTRECRUITERS',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'URL SmartRecruiters sem empresa/posting id reconhecíveis.',
      };
    }

    const endpoint = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyIdentifier)}/postings/${encodeURIComponent(postingId)}`;
    const raw = await this.http.getJson<unknown>(endpoint, {
      source: 'smartrecruiters-resolver',
      requestsPerSecond: 1,
    });
    const job = smartRecruitersPostingSchema.parse(raw);
    const sections = job.jobAd?.sections;
    const description = [
      sections?.jobDescription?.text,
      sections?.qualifications?.text,
      sections?.additionalInformation?.text,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => stripHtml(value).trim())
      .filter(Boolean)
      .join('\n\n');
    const location = [job.location?.city, job.location?.region, job.location?.country]
      .filter((value): value is string => Boolean(value))
      .join(', ');

    return {
      supported: true,
      platform: 'SMARTRECRUITERS',
      flow: 'ATS',
      data: {
        externalId: job.uuid ?? job.id,
        title: job.name,
        company: job.company?.name,
        description: description || job.name,
        location: location || undefined,
        remoteType: job.location?.remote ? 'REMOTE' : 'UNSPECIFIED',
        employmentType: job.typeOfEmployment?.label ?? undefined,
        applicationUrl: job.applyUrl ?? job.postingUrl ?? url.toString(),
        publishedAt: job.releasedDate ?? undefined,
      },
      missingFields: [
        ...(job.company?.name ? [] : ['company']),
        ...(description ? [] : ['description']),
      ],
      message:
        job.active === false
          ? 'A publicação SmartRecruiters está marcada como inativa.'
          : undefined,
    };
  }

  private async resolveRecruitee(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const parts = url.pathname.split('/').filter(Boolean);
    const offerIndex = parts.findIndex((part) => part === 'o');
    const slug = offerIndex >= 0 ? parts[offerIndex + 1] : undefined;
    if (!slug) {
      return {
        supported: false,
        platform: 'RECRUITEE',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'URL Recruitee sem slug de vaga reconhecível.',
      };
    }

    const endpoint = `${url.origin}/api/offers/`;
    const raw = await this.http.getJson<unknown>(endpoint, {
      source: 'recruitee-resolver',
      requestsPerSecond: 1,
    });
    const feed = recruiteeFeedSchema.parse(raw);
    const requested = canonicalPublicUrl(url.toString());
    const job = feed.offers.find((offer) => {
      if (offer.slug === slug) return true;
      return [offer.careers_url, offer.careers_apply_url]
        .filter((value): value is string => Boolean(value))
        .some((value) => canonicalPublicUrl(value) === requested);
    });

    if (!job) {
      return {
        supported: false,
        platform: 'RECRUITEE',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'A vaga não foi localizada entre as publicações atuais desse site Recruitee.',
      };
    }

    const description = [job.description, job.requirements]
      .filter((value): value is string => Boolean(value))
      .map((value) => stripHtml(value).trim())
      .filter(Boolean)
      .join('\n\n');
    const structuredLocations = job.locations
      .map((location) => {
        if (location.name) return location.name;
        return [location.city, location.state, location.country]
          .filter((value): value is string => Boolean(value))
          .join(', ');
      })
      .filter(Boolean);
    const location = structuredLocations.join(' / ') || job.location || undefined;
    const remoteType = job.remote
      ? 'REMOTE'
      : job.hybrid
        ? 'HYBRID'
        : job.on_site
          ? 'ONSITE'
          : remoteTypeFromText(location);

    return {
      supported: true,
      platform: 'RECRUITEE',
      flow: 'ATS',
      data: {
        externalId: String(job.id),
        title: job.title,
        company: job.company_name ?? undefined,
        description: description || job.title,
        location,
        remoteType,
        employmentType: job.employment_type_code ?? undefined,
        applicationUrl: job.careers_apply_url ?? job.careers_url ?? url.toString(),
        publishedAt: job.published_at ?? undefined,
      },
      missingFields: [
        ...(job.company_name ? [] : ['company']),
        ...(description ? [] : ['description']),
      ],
      message: job.company_name
        ? undefined
        : 'Dados públicos da vaga Recruitee carregados; confirme a empresa antes de importar.',
    };
  }

  private async resolveWorkable(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    const jobIndex = parts.findIndex((part) => part === 'j');
    const shortcode = jobIndex >= 0 ? parts[jobIndex + 1] : undefined;

    let account: string | undefined;
    if (host === 'apply.workable.com') {
      account = jobIndex > 0 ? parts[jobIndex - 1] : undefined;
    } else if (host.endsWith('.workable.com') && host !== 'api.workable.com') {
      const subdomain = host.slice(0, -'.workable.com'.length);
      account = subdomain && subdomain !== 'apply' ? subdomain : undefined;
    }

    if (!account) {
      return {
        supported: false,
        platform: 'WORKABLE',
        flow,
        missingFields: ['title', 'company', 'description'],
        message:
          'A URL Workable não informa a conta da empresa; use o link do board da empresa para enriquecimento automático.',
      };
    }

    const endpoint = `https://www.workable.com/api/accounts/${encodeURIComponent(account)}?details=true`;
    const raw = await this.http.getJson<unknown>(endpoint, {
      source: 'workable-resolver',
      requestsPerSecond: 1,
    });
    const board = workableAccountSchema.parse(raw);
    const requested = canonicalPublicUrl(url.toString());
    const job = board.jobs.find((posting) => {
      if (shortcode && posting.shortcode === shortcode) return true;
      return [posting.url, posting.application_url, posting.shortlink]
        .filter((value): value is string => Boolean(value))
        .some((value) => canonicalPublicUrl(value) === requested);
    });

    if (!job) {
      return {
        supported: false,
        platform: 'WORKABLE',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'A vaga não foi localizada entre as publicações atuais dessa conta Workable.',
      };
    }

    const description = stripHtml(job.description ?? '').trim();
    const location = [job.city, job.state, job.country]
      .filter((value): value is string => Boolean(value))
      .join(', ');
    const remoteType =
      job.workplace_type === 'remote'
        ? 'REMOTE'
        : job.workplace_type === 'hybrid'
          ? 'HYBRID'
          : job.workplace_type === 'on_site'
            ? 'ONSITE'
            : job.telecommuting
              ? 'REMOTE'
              : remoteTypeFromText(location);

    return {
      supported: true,
      platform: 'WORKABLE',
      flow: 'ATS',
      data: {
        externalId: job.shortcode,
        title: job.title,
        company: board.name,
        description: description || job.title,
        location: location || undefined,
        remoteType,
        employmentType: job.employment_type ?? undefined,
        applicationUrl: job.url ?? job.application_url ?? job.shortlink ?? url.toString(),
        publishedAt: job.published_on ?? job.created_at ?? undefined,
      },
      missingFields: description ? [] : ['description'],
    };
  }

  private async resolvePersonio(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const parts = url.pathname.split('/').filter(Boolean);
    const jobIndex = parts.findIndex((part) => part === 'job');
    const jobId = jobIndex >= 0 ? parts[jobIndex + 1] : undefined;

    if (!jobId) {
      return {
        supported: false,
        platform: 'PERSONIO',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'URL Personio sem ID de vaga reconhecível.',
      };
    }

    const endpoint = `${url.origin}/xml`;
    const xml = await this.http.getText(endpoint, {
      source: 'personio-resolver',
      requestsPerSecond: 1,
      headers: { Accept: 'application/xml, text/xml;q=0.9' },
    });

    if (!/<workzag-jobs\b/i.test(xml)) {
      throw new Error('XML público da Personio em formato inesperado.');
    }

    const position = extractXmlBlocks(xml, 'position').find(
      (block) => extractXmlTag(block, 'id') === jobId,
    );
    if (!position) {
      return {
        supported: false,
        platform: 'PERSONIO',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'A vaga não foi localizada entre as publicações atuais desse site Personio.',
      };
    }

    const title = extractXmlTag(position, 'name');
    if (!title) {
      throw new Error('Vaga Personio sem título no feed público.');
    }

    const description = extractXmlBlocks(position, 'jobDescription')
      .map((block) => {
        const section = extractXmlTag(block, 'name');
        const value = stripHtml(extractXmlTag(block, 'value') ?? '').trim();
        return [section, value].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
    const company = extractXmlTag(position, 'subcompany');
    const office = extractXmlTag(position, 'office');
    const employmentType = extractXmlTag(position, 'employmentType');
    const schedule = extractXmlTag(position, 'schedule');
    const createdAt = extractXmlTag(position, 'createdAt');
    const publishedAt =
      createdAt && !Number.isNaN(Date.parse(createdAt))
        ? new Date(createdAt).toISOString()
        : undefined;
    const employment = [employmentType, schedule].filter(Boolean).join(' / ');

    return {
      supported: true,
      platform: 'PERSONIO',
      flow: 'ATS',
      data: {
        externalId: jobId,
        title,
        company,
        description: description || title,
        location: office,
        remoteType: remoteTypeFromText(office),
        employmentType: employment || undefined,
        applicationUrl: url.toString(),
        publishedAt,
      },
      missingFields: [...(company ? [] : ['company']), ...(description ? [] : ['description'])],
      message: company
        ? undefined
        : 'Dados públicos da vaga Personio carregados; confirme a empresa antes de importar.',
    };
  }

  private async resolvePinpoint(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const endpoint = `${url.origin}/postings.json`;
    const raw = await this.http.getJson<unknown>(endpoint, {
      source: 'pinpoint-resolver',
      requestsPerSecond: 1,
    });
    const feed = pinpointFeedSchema.parse(raw);
    const requested = canonicalPublicUrl(url.toString());
    const parts = url.pathname.split('/').filter(Boolean);
    const resourceIndex = parts.findIndex((part) => part === 'postings' || part === 'jobs');
    const pathId = resourceIndex >= 0 ? parts[resourceIndex + 1] : undefined;

    const posting = feed.data.find((item) => {
      if (canonicalPublicUrl(item.url) === requested) return true;
      if (item.path && new URL(item.path, url.origin).pathname === url.pathname) return true;
      if (!pathId) return false;
      if (parts[resourceIndex] === 'postings' && item.id === pathId) return true;
      return parts[resourceIndex] === 'jobs' && item.job?.id === pathId;
    });

    if (!posting) {
      return {
        supported: false,
        platform: 'PINPOINT',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'A vaga não foi localizada entre as publicações atuais desse site Pinpoint.',
      };
    }

    const description = [
      posting.description,
      posting.key_responsibilities,
      posting.skills_knowledge_expertise,
      posting.benefits,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => stripHtml(value).trim())
      .filter(Boolean)
      .join('\n\n');
    const workplace = [posting.workplace_type, posting.workplace_type_text, posting.location?.name]
      .filter((value): value is string => Boolean(value))
      .join(' ');

    return {
      supported: true,
      platform: 'PINPOINT',
      flow: 'ATS',
      data: {
        externalId: posting.id,
        title: posting.title,
        description: description || posting.title,
        location: posting.location?.name ?? undefined,
        remoteType: remoteTypeFromText(workplace),
        employmentType: posting.employment_type_text ?? posting.employment_type ?? undefined,
        applicationUrl: posting.application_form_url ?? posting.url,
        publishedAt: posting.created_at ?? undefined,
      },
      missingFields: ['company', ...(description ? [] : ['description'])],
      message: 'Dados públicos da vaga Pinpoint carregados; confirme a empresa antes de importar.',
    };
  }

  private async resolveBreezy(
    url: URL,
    flow: 'ATS' | 'MANUAL' | 'FAST_APPLY',
  ): Promise<ResolvedJobUrl> {
    const html = await this.http.getText(url.toString(), {
      source: 'breezy-resolver',
      requestsPerSecond: 1,
      headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    });

    const posting = extractJsonLdValues(html)
      .map((value) => breezyJobPostingSchema.safeParse(value))
      .find((result) => result.success)?.data;

    if (!posting) {
      return {
        supported: false,
        platform: 'BREEZY',
        flow,
        missingFields: ['title', 'company', 'description'],
        message: 'A página pública Breezy não publicou um JobPosting estruturado reconhecível.',
      };
    }

    const description = stripHtml(posting.description).trim();
    const company = posting.hiringOrganization?.name;
    const places = posting.jobLocation
      ? Array.isArray(posting.jobLocation)
        ? posting.jobLocation
        : [posting.jobLocation]
      : [];
    const physicalLocation = places.map(breezyPlaceName).filter(Boolean).join(' / ');
    const applicantLocation = breezyApplicantLocations(posting.applicantLocationRequirements);
    const telecommute = posting.jobLocationType?.toUpperCase() === 'TELECOMMUTE';
    const location = telecommute
      ? applicantLocation || physicalLocation
      : physicalLocation || applicantLocation;
    const employmentType = Array.isArray(posting.employmentType)
      ? posting.employmentType.join(' / ')
      : (posting.employmentType ?? undefined);
    const publishedAt =
      posting.datePosted && !Number.isNaN(Date.parse(posting.datePosted))
        ? new Date(posting.datePosted).toISOString()
        : undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    const postingIndex = parts.findIndex((part) => part === 'p');
    const externalId = postingIndex >= 0 ? parts[postingIndex + 1] : undefined;

    return {
      supported: true,
      platform: 'BREEZY',
      flow: 'ATS',
      data: {
        externalId,
        title: posting.title,
        company,
        description: description || posting.title,
        location: location || undefined,
        remoteType: telecommute
          ? 'REMOTE'
          : remoteTypeFromText(`${posting.jobLocationType ?? ''} ${location}`),
        employmentType,
        applicationUrl: canonicalPublicUrl(url.toString()),
        publishedAt,
      },
      missingFields: [...(company ? [] : ['company']), ...(description ? [] : ['description'])],
      message: company
        ? undefined
        : 'Dados públicos da vaga Breezy carregados; confirme a empresa antes de importar.',
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
      applicationQuestions: [...job.location_questions, ...job.questions].map((question) => ({
        label: question.label,
        required: question.required,
        fields: question.fields.map((field) => ({
          ...(field.name ? { name: field.name } : {}),
          ...(field.type ? { type: field.type } : {}),
          ...(field.values?.length ? { values: field.values } : {}),
        })),
      })),
    };
  }
}
