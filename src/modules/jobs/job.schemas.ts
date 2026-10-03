import { z } from 'zod';
import { paginationSchema } from '../../shared/http.js';

export const normalizedJobSchema = z.object({
  externalId: z.string().min(1).optional(),
  source: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  remoteType: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNSPECIFIED']),
  employmentType: z.string().optional(),
  seniority: z.string().optional(),
  salaryMin: z.number().nonnegative().optional(),
  salaryMax: z.number().nonnegative().optional(),
  salaryCurrency: z.string().length(3).optional(),
  applicationUrl: z.string().url().optional(),
  originalUrl: z.string().url().optional(),
  publishedAt: z.coerce.date().optional(),
  requiredEducationLevel: z.string().optional(),
  requiredCertifications: z.array(z.string()).default([]),
  skills: z.array(
    z.object({
      skill: z.string().min(1),
      required: z.boolean(),
      yearsRequired: z.number().nonnegative().optional(),
    }),
  ),
  rawData: z.record(z.unknown()),
});

export const manualJobImportSchema = z.object({
  externalId: z.string().min(1).optional(),
  title: z.string().min(1),
  company: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  remoteType: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNSPECIFIED']).default('UNSPECIFIED'),
  employmentType: z.string().optional(),
  seniority: z.string().optional(),
  salaryMin: z.number().nonnegative().optional(),
  salaryMax: z.number().nonnegative().optional(),
  salaryCurrency: z.string().length(3).optional(),
  applicationUrl: z.string().url(),
  publishedAt: z.coerce.date().optional(),
  requiredEducationLevel: z.string().optional(),
  requiredCertifications: z.array(z.string()).default([]),
  skills: z
    .array(
      z.object({
        skill: z.string().min(1),
        required: z.boolean().default(false),
        yearsRequired: z.number().nonnegative().optional(),
      }),
    )
    .default([]),
  fastApply: z.boolean().default(false),
});

export const jobsQuerySchema = paginationSchema.extend({
  status: z
    .enum([
      'DISCOVERED',
      'PREFILTERED',
      'REJECTED_BY_PREFILTER',
      'PENDING_ANALYSIS',
      'ANALYZED',
      'ERROR',
      'STALE',
      'CLOSED',
      'ARCHIVED',
    ])
    .optional(),
  source: z.string().optional(),
  company: z.string().optional(),
  minimumScore: z.coerce.number().int().min(0).max(100).optional(),
  decision: z.enum(['APPLY', 'REVIEW', 'SKIP']).optional(),
  remoteType: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNSPECIFIED']).optional(),
});

export type NormalizedJobInput = z.infer<typeof normalizedJobSchema>;
