import { pgSchema, uuid, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core'
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
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
