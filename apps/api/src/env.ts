import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
  quiet: true,
})

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  PLATFORM_CONNECTOR_CLIENT_ID: z.string().min(1),
  PLATFORM_CONNECTOR_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.never().optional(),
  GOOGLE_CLIENT_SECRET: z.never().optional(),
  SESSION_HMAC_KEY: z.string().min(32, 'must be ≥32 chars'),
  SESSION_TTL_SEC: z.coerce.number().int().positive().default(86400),
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
  MS_BOT_ID: z.string().min(1),
  MS_BOT_SECRET: z.string().min(1),
  MS_BOT_TENANT_ID: z.string().min(1),
  PLANNER_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(180_000),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  AGENT_EMBEDDINGS_PROVIDER: z.enum(['openai', 'azure-openai', 'none']).default('none'),
  APPS_DEPLOYED: z.string().default('studio'),
  MAILER_FROM_ADDRESS_DEFAULT: z.string().email().optional(),
})

export const env = EnvSchema.parse(process.env)

export const deployedApps = () =>
  env.APPS_DEPLOYED.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
