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
  primaryKey,
  check,
  customType,
  numeric,
  date,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

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

/**
 * Web-chat messages (UI chat history). Renamed from agent_message in migration 0015
 * to make room for Plan 04's agent_message (which uses conversation_id FK).
 */
export const agentChatMessages = agentsSchema.table('agent_chat_message', {
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
  roleKey: text('role_key').notNull(),
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
    uniqueIndex('agent_session_conversation_active_uq')
      .on(t.tenantId, t.conversationId)
      .where(sql`ended_at IS NULL`),
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

// ─── Plan 04 — Memory L1-L4 + Conversation State ──────────────────────────────

/**
 * Plan 04 — Active conversation per (tenant, user, surface).
 *
 * Unique partial index on (tenant_id, user_id, surface) WHERE status='active'
 * enforces cross-device consolidation: at most one active conversation per scope.
 * Concurrent loadOrCreateActive calls from two devices converge to the same row.
 */
export const agentConversations = agentsSchema.table(
  'agent_conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    surface: text('surface').notNull(),
    status: text('status').notNull().default('active'),
    title: text('title'),
    lastUserTurnAt: timestamp('last_user_turn_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    summaryFailureStreak: integer('summary_failure_streak').notNull().default(0),
    summaryDisabledAt: timestamp('summary_disabled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('agent_conversation_scope_active_uidx')
      .on(t.tenantId, t.userId, t.surface)
      .where(sql`status = 'active'`),
    index('agent_conversation_tenant_user_status_updated_idx').on(
      t.tenantId,
      t.userId,
      t.status,
      t.updatedAt.desc(),
    ),
    check('agent_conversation_status_check', sql`${t.status} IN ('active', 'archived')`),
  ],
)

/**
 * Plan 04 — Per-turn agent messages with JSONB content and async summary.
 *
 * user_id is denormalized from agent_conversation for keyset pagination (R-04.10)
 * without requiring a join. FTS index covers user utterances + summaries only;
 * raw tool-result content is NEVER indexed (R-04.8).
 */
export const agentConversationMessages = agentsSchema.table(
  'agent_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    content: jsonb('content'),
    summary: text('summary'),
    traceId: uuid('trace_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_message_tenant_user_conv_created_idx').on(
      t.tenantId,
      t.userId,
      t.conversationId,
      t.createdAt,
    ),
    check('agent_message_role_check', sql`${t.role} IN ('user', 'assistant', 'system')`),
  ],
)

/**
 * Plan 04 — L3 user preferences.
 *
 * Key is allowlisted at the service layer (unknown keys are rejected at write).
 * Writes are user-initiated at MVP — the tRPC mutation deliberately omits
 * `.meta({ agent })` so the plan-01 registry cannot invoke it.
 */
export const agentL3Preferences = agentsSchema.table(
  'agent_l3_preference',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').notNull(),
  },
  (t) => [primaryKey({ name: 'agent_l3_preference_pk', columns: [t.tenantId, t.userId, t.key] })],
)

/**
 * Plan 04 — L3.5 agent scratchpad.
 *
 * Schema-allowlisted fields per sub-agent (not free-form markdown). Taint flag
 * travels with the value so downstream consumption can bump approval-tier.
 * Written exclusively via the kernel-audited scratchpad.write tool (R-04.33).
 * Scope key: (tenant_id, user_id) — never (tenant_id, module) per EI-9.
 */
export const agentScratchpad = agentsSchema.table(
  'agent_scratchpad',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    field: text('field').notNull(),
    value: jsonb('value').notNull(),
    tainted: boolean('tainted').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'agent_scratchpad_pk', columns: [t.tenantId, t.userId, t.field] })],
)

// ─── Plan 07 — Observability ───────────────────────────────────────────────────

/**
 * Plan 07 — Tool-output audit trail (R-07.32–35).
 *
 * Stores a canonicalized copy of every tool invocation: args, result preview
 * (first 16 KB as BYTEA), SHA-256 hash of full result, and correlation to the
 * OTel trace span so logs can be joined with distributed traces.
 */
export const agentToolInvocations = agentsSchema.table(
  'agent_tool_invocation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    traceId: uuid('trace_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    toolName: text('tool_name').notNull(),
    args: jsonb('args').notNull(),
    resultPreview: bytea('result_preview'),
    resultHash: text('result_hash'),
    byteCount: integer('byte_count'),
    resultStatus: text('result_status').notNull(),
    subAgentKey: text('sub_agent_key'),
    phase: integer('phase').notNull(),
    iteration: integer('iteration'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_tool_invocation_trace_idx').on(t.traceId),
    index('agent_tool_invocation_tenant_user_tool_created_idx').on(
      t.tenantId,
      t.userId,
      t.toolName,
      t.createdAt.desc(),
    ),
  ],
)

/**
 * Plan 07 — Per-turn sampling decision diagnostic (R-07.17a).
 *
 * One row per turn (trace_id is the PK). Records why a turn was or was not
 * captured so quota exhaustion and trigger matching can be audited after the
 * fact without re-running evaluation logic.
 */
export const agentTurnSamplingDecisions = agentsSchema.table(
  'agent_turn_sampling_decision',
  {
    traceId: uuid('trace_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    capture: boolean('capture').notNull(),
    rootDecisionReason: text('root_decision_reason').notNull(),
    triggersMatchedAtRoot: text('triggers_matched_at_root')
      .array()
      .notNull()
      .default(sql`'{}'`),
    triggersMatchedRetroactively: text('triggers_matched_retroactively')
      .array()
      .notNull()
      .default(sql`'{}'`),
    tenantQuotaExhaustedAt: timestamp('tenant_quota_exhausted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_turn_sampling_decision_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
  ],
)

// ─── Plan 05 — Cost + Ceilings ────────────────────────────────────────────────

/**
 * Plan 05 — Global model pricing (append-only reference data).
 *
 * No tenant_id — pricing is a global catalogue, not tenant-scoped.
 * Rows are never deleted; effective_until marks end-of-validity.
 */
export const agentPricing = agentsSchema.table(
  'agent_pricing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: text('model_id').notNull(),
    inputUsdPerMtok: numeric('input_usd_per_mtok', { precision: 10, scale: 4 }).notNull(),
    inputCachedReadUsdPerMtok: numeric('input_cached_read_usd_per_mtok', {
      precision: 10,
      scale: 4,
    }).notNull(),
    inputCachedWriteUsdPerMtok: numeric('input_cached_write_usd_per_mtok', {
      precision: 10,
      scale: 4,
    }).notNull(),
    outputUsdPerMtok: numeric('output_usd_per_mtok', { precision: 10, scale: 4 }).notNull(),
    outputReasoningUsdPerMtok: numeric('output_reasoning_usd_per_mtok', {
      precision: 10,
      scale: 4,
    }).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  },
  (t) => [uniqueIndex('agent_pricing_model_effective_from_uidx').on(t.modelId, t.effectiveFrom)],
)

/**
 * Plan 05 — Per-turn cost event (append-only).
 *
 * Records token usage and computed cost for every agent turn.
 * pricing_id is a soft reference to agent_pricing.id (no hard FK across tables
 * that may be in different transactions).
 */
export const agentCostEvents = agentsSchema.table(
  'agent_cost_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    traceId: uuid('trace_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    pricingId: uuid('pricing_id').notNull(),
    pricedAt: timestamp('priced_at', { withTimezone: true }).notNull(),
    modelId: text('model_id').notNull(),
    usageInputUncached: integer('usage_input_uncached').notNull().default(0),
    usageInputCachedRead: integer('usage_input_cached_read').notNull().default(0),
    usageInputCachedWrite: integer('usage_input_cached_write').notNull().default(0),
    usageOutput: integer('usage_output').notNull().default(0),
    usageOutputReasoning: integer('usage_output_reasoning').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(),
    layer: text('layer').notNull(),
    retryCount: integer('retry_count').notNull().default(0),
    attemptDurationMs: integer('attempt_duration_ms').notNull().default(0),
    totalDurationMs: integer('total_duration_ms').notNull().default(0),
    /**
     * Plan 09 — Soft reference to agents.agent_schedule.id.
     * Set when this cost event originates from a scheduled turn.
     * NULL for interactive (non-scheduled) turns.
     * Used for per-schedule daily spend aggregation (R-09.32).
     */
    viaScheduleId: uuid('via_schedule_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_cost_event_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('agent_cost_event_tenant_user_created_idx').on(t.tenantId, t.userId, t.createdAt.desc()),
    index('agent_cost_event_tenant_schedule_idx').on(t.tenantId, t.viaScheduleId),
    check(
      'agent_cost_event_layer_check',
      sql`${t.layer} IN ('router','synthesizer','summarizer') OR ${t.layer} LIKE 'sub_agent:%'`,
    ),
  ],
)

/**
 * Plan 05 — Tenant-level daily budget bucket.
 *
 * One row per tenant; remaining_usd is decremented on each cost event and
 * refilled to daily_limit_usd by a nightly cron job.
 */
export const agentTenantBudget = agentsSchema.table('agent_tenant_budget', {
  tenantId: uuid('tenant_id').primaryKey(),
  dailyLimitUsd: numeric('daily_limit_usd', { precision: 10, scale: 2 }).notNull().default('50'),
  remainingUsd: numeric('remaining_usd', { precision: 12, scale: 6 }).notNull(),
  lastRefilledAt: timestamp('last_refilled_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Plan 05 — Per-user daily budget bucket.
 *
 * One row per (tenant, user, date); allows individual spending caps.
 * date is a calendar date so the row is naturally scoped to one day.
 */
export const agentUserBudget = agentsSchema.table(
  'agent_user_budget',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    date: date('date').notNull(),
    dailyLimitUsd: numeric('daily_limit_usd', { precision: 10, scale: 2 }).notNull(),
    remainingUsd: numeric('remaining_usd', { precision: 12, scale: 6 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'agent_user_budget_pk', columns: [t.tenantId, t.userId, t.date] })],
)

/**
 * Plan 05 — Postgres-backed rate limit counter bucket.
 *
 * Fallback counter when Redis is unavailable. One row per
 * (tenant, user, limit_key, bucket) where bucket is the minute or day start.
 */
export const agentRateLimitCounter = agentsSchema.table(
  'agent_rate_limit_counter',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    limitKey: text('limit_key').notNull(),
    bucket: timestamp('bucket', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'agent_rate_limit_counter_pk',
      columns: [t.tenantId, t.userId, t.limitKey, t.bucket],
    }),
    index('agent_rate_limit_counter_lookup_idx').on(t.tenantId, t.userId, t.limitKey, t.bucket),
    check(
      'agent_rate_limit_counter_limit_key_check',
      sql`${t.limitKey} IN ('queries/user/min', 'l3_writes/user/day', 'schedule_creations/user/day')`,
    ),
  ],
)

// ─── Plan 06 ───────────────────────────────────────────────────────────────────

export const agentActiveTurns = agentsSchema.table(
  'agent_active_turn',
  {
    traceId: uuid('trace_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    conversationId: uuid('conversation_id'),
    podId: text('pod_id').notNull(),
    surface: text('surface').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
    abortPending: boolean('abort_pending').notNull().default(false),
  },
  (t) => [
    index('agent_active_turn_tenant_started_idx').on(t.tenantId, t.startedAt.desc()),
    index('agent_active_turn_heartbeat_idx').on(t.lastHeartbeatAt),
  ],
)

// ─── Plan 10 — Harness + Replay + Golden-trace CI + Quality Canary ────────────

/**
 * Plan 10 — CI-gating golden trace set (≤20 active rows).
 *
 * Each row defines a fixture utterance with expected tool calls, answer shape,
 * permission keys, and taint expectation. The CI harness replays all active rows
 * and gates the pipeline if any assertion fails.
 */
export const agentGoldenTrace = agentsSchema.table(
  'agent_golden_trace',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    fixtureTenantId: uuid('fixture_tenant_id').notNull(),
    seedUserId: uuid('seed_user_id').notNull(),
    userUtterance: text('user_utterance').notNull(),
    expectedToolCalls: jsonb('expected_tool_calls').notNull().$type<string[]>(),
    expectedShape: text('expected_shape').notNull(),
    expectedPermissionKeys: jsonb('expected_permission_keys').notNull().$type<string[]>(),
    taintExpectation: boolean('taint_expectation').notNull(),
    answerShapeContract: jsonb('answer_shape_contract').notNull(),
    adversarialCategory: text('adversarial_category'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removalReason: text('removal_reason'),
  },
  (t) => [
    index('agent_golden_trace_fixture_tenant_idx').on(t.fixtureTenantId),
    index('agent_golden_trace_fixture_tenant_active_idx')
      .on(t.fixtureTenantId)
      .where(sql`removed_at IS NULL`),
    check(
      'agent_golden_trace_expected_shape_check',
      sql`${t.expectedShape} IN ('short-answer', 'list', 'table', 'narrative', 'chart', 'refusal')`,
    ),
    check(
      'agent_golden_trace_adversarial_category_check',
      sql`${t.adversarialCategory} IS NULL OR ${t.adversarialCategory} IN ('sanitization-projection', 'taint-escalation', 'permission-denial', 'disambiguation', 'contradiction')`,
    ),
  ],
)

/**
 * Plan 10 — Scorer registry.
 *
 * Tracks all registered scorers (deterministic or LLM-judge) with their scope,
 * meta-evaluation agreement score, and promotion status. Only `gating_eligible`
 * scorers are used in CI pass/fail decisions.
 */
export const agentScorerRegistration = agentsSchema.table(
  'agent_scorer_registration',
  {
    scorerId: text('scorer_id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    scope: text('scope').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
    metaEvalAgreement: numeric('meta_eval_agreement', { precision: 5, scale: 4 }),
    status: text('status').notNull().default('provisional'),
  },
  (t) => [
    check('agent_scorer_registration_kind_check', sql`${t.kind} IN ('deterministic', 'llm-judge')`),
    check(
      'agent_scorer_registration_scope_check',
      sql`${t.scope} IN ('live', 'trace', 'experiment', 'test')`,
    ),
    check(
      'agent_scorer_registration_status_check',
      sql`${t.status} IN ('provisional', 'gating_eligible')`,
    ),
  ],
)

/**
 * Plan 10 — Per-tick canary execution record.
 *
 * One row per canary run. Stores the outcome, score, and duration so the
 * quality canary dashboard can trend pass rates over time.
 */
export const agentCanaryRun = agentsSchema.table(
  'agent_canary_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    tier: text('tier').notNull(),
    canaryQueryId: uuid('canary_query_id').notNull(),
    fixtureTenantId: uuid('fixture_tenant_id').notNull(),
    traceId: uuid('trace_id').notNull(),
    outcome: text('outcome').notNull(),
    score: numeric('score', { precision: 5, scale: 4 }).notNull(),
    durationMs: integer('duration_ms').notNull(),
  },
  (t) => [
    index('agent_canary_run_tier_run_at_idx').on(t.tier, t.runAt.desc()),
    check('agent_canary_run_tier_check', sql`${t.tier} IN ('full', 'nano')`),
    check('agent_canary_run_outcome_check', sql`${t.outcome} IN ('passed', 'failed', 'error')`),
  ],
)

/**
 * Plan 10 — Rotated canary query set.
 *
 * Each row is a single canary question with its expected answer contract.
 * Queries are rotated quarterly and tagged by tier (full or nano) so the
 * canary scheduler can select the correct subset.
 */
export const agentCanaryQuery = agentsSchema.table(
  'agent_canary_query',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tier: text('tier').notNull(),
    utterance: text('utterance').notNull(),
    fixtureTenantId: uuid('fixture_tenant_id').notNull(),
    expectedAnswerContract: jsonb('expected_answer_contract').notNull(),
    rotationQuarter: text('rotation_quarter').notNull(),
    source: text('source').notNull(),
    status: text('status').notNull().default('active'),
  },
  (t) => [
    index('agent_canary_query_tier_status_idx').on(t.tier, t.status),
    index('agent_canary_query_fixture_tenant_quarter_idx').on(t.fixtureTenantId, t.rotationQuarter),
    check('agent_canary_query_tier_check', sql`${t.tier} IN ('full', 'nano')`),
    check(
      'agent_canary_query_source_check',
      sql`${t.source} IN ('production_anonymized', 'manually_authored')`,
    ),
    check('agent_canary_query_status_check', sql`${t.status} IN ('active', 'retired')`),
  ],
)
