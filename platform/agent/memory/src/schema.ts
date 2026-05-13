import type { KernelMessageContent } from '@seta/agent-core'
import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const agentMemorySchema = pgSchema('agent_memory')

export const threads = agentMemorySchema.table(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    resourceId: text('resource_id'),
    title: text('title'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    messageCount: integer('message_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('threads_tenant_resource_updated_idx').on(t.tenantId, t.resourceId, t.updatedAt.desc()),
    pgPolicy('tenant_isolation_threads', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const messages = agentMemorySchema.table(
  'messages',
  {
    id: uuid('id').primaryKey(),
    threadId: uuid('thread_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    resourceId: text('resource_id'),
    role: text('role').notNull(),
    content: jsonb('content').$type<KernelMessageContent[]>().notNull(),
    toolCallId: text('tool_call_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('messages_thread_created_idx').on(t.tenantId, t.threadId, t.createdAt.desc(), t.id),
    pgPolicy('tenant_isolation_messages', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const resources = agentMemorySchema.table(
  'resources',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    workingMemory: text('working_memory'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('working_memory_8k', sql`octet_length(${t.workingMemory}) <= 8192`),
    pgPolicy('tenant_isolation_resources', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type Thread = typeof threads.$inferSelect
export type NewThread = typeof threads.$inferInsert
export type MessageRow = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type Resource = typeof resources.$inferSelect
export type NewResource = typeof resources.$inferInsert
