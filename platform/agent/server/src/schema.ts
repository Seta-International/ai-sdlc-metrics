import { sql } from 'drizzle-orm'
import { check, index, jsonb, numeric, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const agentSchema = pgSchema('agent')

export const agentProfiles = agentSchema.table(
  'agent_profiles',
  {
    agentId: uuid('agent_id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    slug: text('slug'),
    name: text('name').notNull(),
    description: text('description'),
    instructions: text('instructions').notNull(),
    model: text('model').notNull(),
    toolIds: text('tool_ids').array().notNull().default(sql`'{}'`),
    workingMemoryTemplate: text('working_memory_template'),
    temperature: numeric('temperature', { precision: 3, scale: 2 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    status: text('status').notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('status_check', sql`${t.status} IN ('draft', 'published', 'archived')`),
    index('agent_profiles_by_tenant_slug').on(t.tenantId, t.slug),
  ],
)

export const agentActions = agentSchema.table(
  'agent_actions',
  {
    actionId: uuid('action_id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    spec: jsonb('spec').$type<Record<string, unknown>>().notNull(),
    auth: jsonb('auth').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('agent_actions_by_agent').on(t.agentId, t.tenantId)],
)

export type AgentProfileRow = typeof agentProfiles.$inferSelect
export type NewAgentProfile = typeof agentProfiles.$inferInsert
export type AgentActionRow = typeof agentActions.$inferSelect
export type NewAgentAction = typeof agentActions.$inferInsert
