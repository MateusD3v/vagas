import type { RemoteType } from '@prisma/client';

export interface RawJob {
  externalId?: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType: RemoteType;
  employmentType?: string;
  seniority?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applicationUrl?: string;
  originalUrl?: string;
  publishedAt?: Date;
  requiredEducationLevel?: string;
  requiredCertifications?: string[];
  skills: Array<{ skill: string; required: boolean; yearsRequired?: number }>;
  [key: string]: unknown;
}

export interface JobSearchQuery {
  keywords: string[];
  locations: string[];
  remoteTypes: RemoteType[];
  employmentTypes: string[];
  publishedAfter?: Date;
  limit?: number;
}

export interface JobSourceCapabilities {
  supportsKeywordSearch: boolean;
  supportsLocationSearch: boolean;
  supportsRemoteFilter: boolean;
  supportsPublishedAfter: boolean;
  supportsPagination: boolean;
}

export interface JobSourceRateLimit {
  requestsPerSecond: number;
  concurrency: number;
}

export interface NormalizedJob extends RawJob {
  source: string;
  rawData: Record<string, unknown>;
}

export interface JobSourceAdapter {
  readonly source: string;
  readonly sourceName: string;
  readonly capabilities: JobSourceCapabilities;
  readonly rateLimit: JobSourceRateLimit;
  searchJobs(query?: JobSearchQuery): Promise<unknown[]>;
  getJobDetails?(externalId: string): Promise<unknown>;
  normalizeJob(raw: unknown): NormalizedJob;
}
