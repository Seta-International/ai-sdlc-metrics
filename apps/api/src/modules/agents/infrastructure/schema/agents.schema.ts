import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const agentsSchema = pgSchema('agents')

/**
 * Web-chat session (a conversation with a Future assistant through the chat UI).
 *
 * This is distinct from `agent_session`, which is the Plan 02 pinned-hash
 * replay record for deterministic turn execution. Web-chat sessions track
 * channel/status/context metadata for user-facing conversations.
 */
export const agentChatSessions = agentsSchema.table('agent_chat_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  agentId: uuid('agent_id'),
  channelType: text('channel_type').notNull().default('web_chat'),
  status: text('status').notNull().default('active'),
  contextModule: text('context_module'),
  contextEntity: text('context_entity'),
  contextEntityId: text('context_entity_id'),
  contextMetadata: jsonb('context_metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
})

export const agentMessages = agentsSchema.table('agent_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolName: text('tool_name'),
  toolArgs: jsonb('tool_args'),
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used'),
  isError: boolean('is_error').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentInsights = agentsSchema.table('agent_insight', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  module: text('module').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  severity: text('severity').notNull().default('info'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  actionLabel: text('action_label'),
  actionHref: text('action_href'),
  isDismissed: boolean('is_dismissed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentPromptStore = agentsSchema.table('agent_prompt_store', {
  contentHash: text('content_hash').primaryKey(),
  layer: text('layer').notNull(),
  content: text('content').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentNarrativeStore = agentsSchema.table('agent_narrative_store', {
  contentHash: text('content_hash').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  roleId: uuid('role_id').notNull(),
  content: text('content').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Plan 02 — Pinned-hash replay record for a conversation turn.
 *
 * Created at the first turn of a conversation; referenced by every subsequent
 * turn so mid-session registry changes do NOT affect active sessions. Enables
 * deterministic replay by pinning the exact prompt/catalog/schema hashes that
 * were active when the session started.
 */
export const agentSessions = agentsSchema.table(
  'agent_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    routerPromptHash: text('router_prompt_hash').notNull(),
    permissionNarrativeHash: text('permission_narrative_hash').notNull(),
    toolCatalogHash: text('tool_catalog_hash').notNull(),
    directiveSchemaHash: text('directive_schema_hash').notNull(),
    canonicalizerVersionHash: text('canonicalizer_version_hash').notNull(),
    pinnedSubAgentPromptHashes: jsonb('pinned_sub_agent_prompt_hashes')
      .$type<Record<string, string>>()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('agent_session_conversation_lookup_idx').on(
      t.tenantId,
      t.userId,
      t.conversationId,
      t.startedAt.desc(),
    ),
  ],
)

/**
 * Plan 02 — Stored sub-agent configuration (Beta stub).
 *
 * Schema declared now so migrations do not block later work. Write path is
 * NOT exposed at MVP; the read path (`findActiveByKey`) is real and will
 * return rows naturally once Beta enables writes.
 */
export const agentStoredSubAgents = agentsSchema.table(
  'agent_stored_sub_agent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    key: text('key').notNull(),
    config: jsonb('config').notNull(),
    version: integer('version').notNull(),
    status: text('status').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('agent_stored_sub_agent_tenant_key_version_uidx').on(t.tenantId, t.key, t.version),
    index('agent_stored_sub_agent_tenant_key_status_idx').on(t.tenantId, t.key, t.status),
    index('agent_stored_sub_agent_tenant_key_version_desc_idx').on(
      t.tenantId,
      t.key,
      t.version.desc(),
    ),
    check(
      'agent_stored_sub_agent_status_check',
      sql`${t.status} IN ('draft', 'active', 'retired')`,
    ),
  ],
)
