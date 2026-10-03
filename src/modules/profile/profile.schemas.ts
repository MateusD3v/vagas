import { z } from 'zod';

const optionalUrl = z.string().url().nullable().optional();

export const skillSchema = z.object({
  name: z.string().min(1),
  level: z.string().min(1),
  yearsOfExperience: z.number().min(0).default(0),
});

export const languageSchema = z.object({
  language: z.string().min(1),
  level: z.string().min(1),
});

export const experienceSchema = z
  .object({
    company: z.string().min(1),
    role: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    current: z.boolean().default(false),
    description: z.string().min(1),
    technologies: z.array(z.string().min(1)).default([]),
    achievements: z.array(z.string().min(1)).default([]),
  })
  .refine((value) => value.current || value.endDate, {
    message: 'endDate é obrigatório quando current=false',
    path: ['endDate'],
  });

export const preferencesSchema = z
  .object({
    desiredRoles: z.array(z.string().min(1)).default([]),
    excludedRoles: z.array(z.string().min(1)).default([]),
    desiredTechnologies: z.array(z.string().min(1)).default([]),
    preferredLocations: z.array(z.string().min(1)).default([]),
    remoteAllowed: z.boolean().default(true),
    hybridAllowed: z.boolean().default(true),
    onsiteAllowed: z.boolean().default(false),
    relocationAllowed: z.boolean().default(false),
    minimumSalary: z.number().nonnegative().nullable().optional(),
    employmentTypes: z.array(z.string().min(1)).default([]),
    seniorityLevels: z.array(z.string().min(1)).default([]),
    automaticApplicationThreshold: z.number().int().min(0).max(100).default(85),
    reviewThreshold: z.number().int().min(0).max(100).default(65),
  })
  .refine((value) => value.reviewThreshold <= value.automaticApplicationThreshold, {
    message: 'reviewThreshold deve ser menor ou igual a automaticApplicationThreshold',
    path: ['reviewThreshold'],
  });

export const applicationPolicySchema = z.object({
  autoApplyEnabled: z.boolean().default(false),
  minimumScore: z.number().int().min(0).max(100).default(85),
  maximumApplicationsPerDay: z.number().int().positive().default(10),
  allowedSources: z.array(z.string()).default([]),
  blockedCompanies: z.array(z.string()).default([]),
  blockedKeywords: z.array(z.string()).default([]),
  requireSalaryInformation: z.boolean().default(false),
  requireRemote: z.boolean().default(false),
});

export const answerSchema = z.object({
  questionKey: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  answerType: z.string().min(1),
  allowedForAutomaticUse: z.boolean().default(false),
});

export const profileCreateSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().min(2),
  linkedinUrl: optionalUrl,
  githubUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  educationLevel: z.string().nullable().optional(),
  course: z.string().nullable().optional(),
  institution: z.string().nullable().optional(),
  graduationDate: z.coerce.date().nullable().optional(),
  professionalSummary: z.string().min(10),
  yearsOfExperience: z.number().min(0).default(0),
  desiredJobTypes: z.array(z.string()).default([]),
  desiredRoles: z.array(z.string()).default([]),
  desiredLocations: z.array(z.string()).default([]),
  remotePreference: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNSPECIFIED']).default('UNSPECIFIED'),
  minimumSalary: z.number().nonnegative().nullable().optional(),
  salaryCurrency: z.string().length(3).nullable().optional(),
  certifications: z.array(z.string()).default([]),
  skills: z.array(skillSchema).default([]),
  languages: z.array(languageSchema).default([]),
  experiences: z.array(experienceSchema).default([]),
  preferences: preferencesSchema,
  policy: applicationPolicySchema.optional(),
  answers: z.array(answerSchema).default([]),
});

export const profileUpdateSchema = profileCreateSchema;
export const profilePatchSchema = profileCreateSchema.partial();

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
