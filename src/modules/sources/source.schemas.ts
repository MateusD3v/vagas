import { z } from 'zod';
import { paginationSchema } from '../../shared/http.js';

export const sourcesQuerySchema = paginationSchema.extend({
  enabled: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  type: z.enum(['API', 'FEED', 'ATS', 'MOCK']).optional(),
});

export const collectionRunsQuerySchema = paginationSchema.extend({
  source: z.string().optional(),
  status: z.enum(['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const searchProfileUpdateSchema = z.object({
  enabled: z.boolean(),
  keywords: z.array(z.string().min(1)).min(1),
  excludedKeywords: z.array(z.string().min(1)),
  locations: z.array(z.string().min(1)),
  remoteTypes: z.array(z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNSPECIFIED'])),
  employmentTypes: z.array(z.string().min(1)),
  seniorityLevels: z.array(z.string().min(1)),
  maxJobsPerRun: z.number().int().positive().max(100),
  publishedWithinHours: z.number().int().positive().nullable(),
});
