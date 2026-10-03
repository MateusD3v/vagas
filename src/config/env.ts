import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .default('postgresql://job_agent:job_agent@localhost:5432/job_agent?schema=public'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),
    AI_ADJUSTMENT_LIMIT: z.coerce.number().int().min(0).max(20).default(10),
    DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().max(100).default(20),
    MAX_PAGE_SIZE: z.coerce.number().int().positive().max(500).default(100),
    ADMIN_API_KEY: z.string().optional(),
    JOB_COLLECTION_CRON: z.string().default('0 */6 * * *'),
    JOB_SOURCE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    JOB_SOURCE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
    JOB_SOURCE_USER_AGENT: z.string().default('JobApplicationAgent/0.3 (+local-development)'),
    SOURCE_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
    SOURCE_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(30),
    COLLECTION_RUN_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
    JOB_STALE_AFTER_DAYS: z.coerce.number().int().positive().default(14),
    JOB_CLOSED_AFTER_DAYS: z.coerce.number().int().positive().default(30),
    AUTO_ANALYZE_NEW_JOBS: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    LLM_MAX_ANALYSES_PER_RUN: z.coerce.number().int().positive().default(25),
    LLM_MAX_ANALYSES_PER_DAY: z.coerce.number().int().positive().default(100),
    MATCHING_ENGINE_VERSION: z.coerce.number().int().positive().default(1),
    MAX_JOB_AGE_DAYS: z.coerce.number().int().positive().default(14),
    ENABLE_REAL_JOB_SOURCES: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    ENABLE_AUTO_ANALYSIS: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    ENABLE_NOTIFICATIONS: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    NOTIFICATION_WEBHOOK_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),
    NOTIFICATION_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
    ENABLE_SCHEDULER: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    SAFE_MODE: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    REMOTIVE_ENABLED: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    ARBEITNOW_ENABLED: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    RAW_DATA_MAX_BYTES: z.coerce.number().int().positive().max(250_000).default(50_000),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.ADMIN_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_API_KEY'],
        message: 'ADMIN_API_KEY é obrigatório em production',
      });
    }
    if (value.JOB_CLOSED_AFTER_DAYS <= value.JOB_STALE_AFTER_DAYS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JOB_CLOSED_AFTER_DAYS'],
        message: 'JOB_CLOSED_AFTER_DAYS deve ser maior que JOB_STALE_AFTER_DAYS',
      });
    }
  });

export type Environment = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
