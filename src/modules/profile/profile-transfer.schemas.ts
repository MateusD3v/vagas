import { z } from 'zod';
import { searchProfileUpdateSchema } from '../sources/source.schemas.js';
import { profileCreateSchema } from './profile.schemas.js';

export const profileTransferBundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime().optional(),
  profile: profileCreateSchema,
  searchProfile: searchProfileUpdateSchema.nullable().optional(),
});

export type ProfileTransferBundle = z.infer<typeof profileTransferBundleSchema>;
