import { uuid, text, timestamp, jsonb, boolean, integer, numeric, index } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { agentsSchema } from './agents.schema'

/**
 * Plan 09 — Agent schedule configuration.
 *
 * One row per scheduled agent invocation policy. Supports two trigger kinds:
 *   - 'cron'  — fires on a UTC cron expression
 *   - 'event' — fires when a matching domain event is published
 *
 * Kind variants:
 *   - 'personal'     — scoped to owner_user_id; agent acts on their behalf
 *   - 'tenant_wide'  — tenant-level schedule; owner_user_id IS NULL
 *
 * delegation_id is a soft reference to core.agent_delegation.id (no FK
 * across schema boundaries per hard constraint).
 */
export const agentSchedule = agentsSchema.table(
  'agent_schedule',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    /** RLS anchor — every row belongs to a single tenant. */
    tenantId: uuid('tenant_id').notNull(),
    /**
     * Schedule kind.
     * Allowed values: 'personal' | 'tenant_wide'
     */
    kind: text('kind').notNull(),
    /**
     * The user on whose behalf the schedule fires.
     * NULL for tenant_wide schedules.
     */
    ownerUserId: uuid('owner_user_id'),
    /** The user (or system actor) that created this schedule. */
    createdBy: uuid('created_by').notNull(),
    /**
     * What fires this schedule.
     * Allowed values: 'cron' | 'event'
     */
    triggerKind: text('trigger_kind').notNull(),
    /** UTC cron expression. Required when trigger_kind = 'cron'. */
    cronExpression: text('cron_expression'),
    /**
     * Event-match descriptor when trigger_kind = 'event'.
     * Shape: { event_type: string, filter?: Record<string, unknown> }
     */
    eventSubscription: jsonb('event_subscription'),
    /** The prompt template sent to the agent on each invocation. */
    prompt: text('prompt').notNull(),
    /**
     * Soft reference to core.agent_delegation.id that authorises
     * autonomous writes for this schedule.
     */
    delegationId: uuid('delegation_id').notNull(),
    /**
     * Per-schedule daily spend ceiling in USD.
     * Scheduler refuses new runs once crossed within the UTC day.
     */
    costCeilingDailyUsd: numeric('cost_ceiling_daily_usd', { precision: 10, scale: 2 })
      .notNull()
      .default('1.00'),
    /**
     * Maximum invocations per UTC calendar day.
     * Scheduler refuses new runs once reached.
     */
    invocationCeilingDaily: integer('invocation_ceiling_daily').notNull().default(10),
    /**
     * Lifecycle status.
     * Allowed values: 'active' | 'paused' | 'deleted'
     */
    status: text('status').notNull().default('active'),
    /**
     * Machine-readable pause reason (set when status = 'paused').
     * Allowed values: 'owner_requested' | 'delegation_expired' |
     *   'owner_offboarded' | 'tenant_spend_exhausted' |
     *   'consecutive_failures' | 'admin_intervention'
     */
    pauseReason: text('pause_reason'),
    /** Number of consecutive failed runs; reset on success. */
    consecutiveFailureCount: integer('consecutive_failure_count').notNull().default(0),
    /**
     * Who receives failure alerts.
     * Allowed values: 'owner' | 'owner_and_admin' | 'admin_only' | 'silent'
     */
    failureAlertPolicy: text('failure_alert_policy').notNull().default('owner_and_admin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Cron scheduler lookup — filters on active cron schedules per tenant. */
    index('agent_schedule_tenant_status_trigger_idx').on(t.tenantId, t.status, t.triggerKind),
    /** User's schedule list — all schedules for a given owner. */
    index('agent_schedule_tenant_owner_status_idx').on(t.tenantId, t.ownerUserId, t.status),
    /** Delegation lifecycle — find schedules linked to an expiring delegation. */
    index('agent_schedule_tenant_delegation_idx').on(t.tenantId, t.delegationId),
  ],
)

export type AgentScheduleRow = typeof agentSchedule.$inferSelect
export type NewAgentScheduleRow = typeof agentSchedule.$inferInsert
