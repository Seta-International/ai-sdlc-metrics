import 'dotenv/config'
import { z } from 'zod'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  ENTRA_CLIENT_ID: z.string().min(1),
  ENTRA_CLIENT_SECRET: z.string().min(1),
  KMS_PROVIDER: z.enum(['aws', 'env']).default('env'),
  DEV_DEK_BASE64: z.string().optional(),
  AWS_REGION: z.string().optional(),
  KMS_KEY_ARN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_API_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-10-21'),
  CONTINUATION_HMAC_KEY: z.string().min(64, 'must be ≥32 bytes (64 hex chars)'),
  PLANNER_CACHE_TTL_TASKS_SEC: z.coerce.number().int().positive().default(60),
  PLANNER_CACHE_TTL_PLANS_SEC: z.coerce.number().int().positive().default(600),
  PLANNER_CACHE_TTL_BUCKETS_SEC: z.coerce.number().int().positive().default(300),
  PLANNER_CACHE_STALE_FALLBACK_MAX_SEC: z.coerce.number().int().positive().default(3600),
  PLANNER_BATCH_CONCURRENCY: z.coerce.number().int().positive().default(3),
  CONTINUATION_TTL_MIN: z.coerce.number().int().positive().default(15),
})

export const env = Env.parse(process.env)
