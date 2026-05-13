import type { KernelMessageContent } from '@seta/agent-core'
import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
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

export const conversations = agentMemorySchema.table(
  'conversations',
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
    index('conversations_tenant_resource_updated_idx').on(
      t.tenantId,
      t.resourceId,
      t.updatedAt.desc(),
    ),
    pgPolicy('tenant_isolation_conversations', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const turns = agentMemorySchema.table(
  'turns',
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
    index('turns_thread_created_idx').on(t.tenantId, t.threadId, t.createdAt.desc(), t.id),
    pgPolicy('tenant_isolation_turns', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export const workingMemory = agentMemorySchema.table(
  'working_memory',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    workingMemory: text('working_memory'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    pgPolicy('tenant_isolation_working_memory', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
      withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    }),
  ],
)

export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type TurnRow = typeof turns.$inferSelect
export type NewTurn = typeof turns.$inferInsert
export type WorkingMemoryRow = typeof workingMemory.$inferSelect
export type NewWorkingMemory = typeof workingMemory.$inferInsert
