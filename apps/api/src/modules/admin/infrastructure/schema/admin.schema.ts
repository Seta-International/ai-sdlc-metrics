import {
  pgSchema,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
  numeric,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const adminSchema = pgSchema('admin')

export const tenantEmailConfig = adminSchema.table('tenant_email_config', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  provider: text('provider', { enum: ['ses', 'smtp'] }).notNull(),
  fromAddress: text('from_address').notNull(),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  credentialRef: text('credential_ref').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const tenantAiProviderConfig = adminSchema.table('tenant_ai_provider_config', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  providerType: text('provider_type', { enum: ['openai'] }).notNull(),
  apiKeyRef: text('api_key_ref').notNull(),
  apiKeyLastFour: text('api_key_last_four'),
  defaultReasoningModel: text('default_reasoning_model').notNull().default('gpt-5.4'),
  defaultClassificationModel: text('default_classification_model')
    .notNull()
    .default('gpt-5.4-nano'),
  embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),
  status: text('status', { enum: ['ready', 'needs_attention', 'disabled'] })
    .notNull()
    .default('needs_attention'),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tenantModuleToggle = adminSchema.table(
  'tenant_module_toggle',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    moduleKey: text('module_key').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').notNull(),
  },
  (t) => [uniqueIndex('tenant_module_toggle_tenant_module_idx').on(t.tenantId, t.moduleKey)],
)

export const tenantSettings = adminSchema.table('tenant_settings', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  plannerCoreEnabled: boolean('planner_core_enabled').notNull().default(false),
  plannerViewsEnabled: boolean('planner_views_enabled').notNull().default(false),
  plannerGridEnabled: boolean('planner_grid_enabled').notNull().default(false),
  plannerScheduleEnabled: boolean('planner_schedule_enabled').notNull().default(false),
  plannerChartsEnabled: boolean('planner_charts_enabled').notNull().default(false),
  plannerChartsTrendsEnabled: boolean('planner_charts_trends_enabled').notNull().default(false),
  plannerPersonalEnabled: boolean('planner_personal_enabled').notNull().default(false),
  plannerMsSyncEnabled: boolean('planner_ms_sync_enabled').notNull().default(false),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  maxSampledTurnsPerDay: integer('max_sampled_turns_per_day').notNull().default(10000),
  /**
   * Plan 09 — Maximum number of active (non-deleted, non-paused) schedules
   * allowed across the tenant. Scheduler refuses schedule creation once reached.
   */
  maxActiveSchedules: integer('max_active_schedules').notNull().default(100),
  /**
   * Plan 09 — Tenant-wide daily spend ceiling across all scheduled turns.
   * NULL means no tenant-level cap (per-schedule ceilings still apply).
   */
  scheduledSpendDailyLimitUsd: numeric('scheduled_spend_daily_limit_usd', {
    precision: 10,
    scale: 2,
  }),
  /**
   * Plan 09 — Default failure alert policy applied to new schedules at creation
   * time when the creator does not specify one.
   * Allowed values: 'owner' | 'owner_and_admin' | 'admin_only' | 'silent'
   */
  defaultScheduleFailureAlertPolicy: text('default_schedule_failure_alert_policy')
    .notNull()
    .default('owner_and_admin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
