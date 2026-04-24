import { uuid, text, timestamp, jsonb, boolean, numeric, index } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { agentsSchema } from './agents.schema'

/**
 * Plan 09 — Agent schedule run record (append-only).
 *
 * One row per invocation of an agent_schedule. Created at spawn time by the
 * scheduler worker; updated when the turn completes (ended_at, outcome,
 * cost_spent_usd).
 *
 * schedule_id is a soft reference to agents.agent_schedule.id.
 * pg_boss_job_id correlates with the pg-boss internal job row for diagnostics.
 *
 * pinned_versions captures the exact hashes active at spawn time so the run
 * can be replayed deterministically:
 *   { router_version, sub_agent_version, tool_meta_version, model_id }
 */
export const agentScheduleRun = agentsSchema.table(
  'agent_schedule_run',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    /** Soft reference to agents.agent_schedule.id. */
    scheduleId: uuid('schedule_id').notNull(),
    /** RLS anchor — every row belongs to a single tenant. */
    tenantId: uuid('tenant_id').notNull(),
    /** OTel trace id for this invocation — correlates with agent_cost_event. */
    traceId: uuid('trace_id').notNull(),
    /**
     * Flow id stamped at spawn; correlates all agent work for this run
     * to a single scheduling origin.
     */
    flowId: uuid('flow_id').notNull(),
    /** pg-boss internal job id for cross-system correlation and diagnostics. */
    pgBossJobId: text('pg_boss_job_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /**
     * Terminal outcome of the run (NULL while in-flight).
     * Allowed values: 'completed' | 'refused' | 'budget' | 'error' |
     *   'cancelled_per_run' | 'cancelled_schedule_paused'
     */
    outcome: text('outcome'),
    /**
     * True when any L3.5 scratchpad value read at spawn time was tainted.
     * Mirrors agent_draft.taint_at_draft_time for schedule-originated turns.
     */
    taintSeeded: boolean('taint_seeded').notNull().default(false),
    /**
     * Snapshot of component versions active at spawn time.
     * Shape: { router_version, sub_agent_version, tool_meta_version, model_id }
     */
    pinnedVersions: jsonb('pinned_versions').notNull().default({}),
    /** Accumulated cost for this run in USD (updated on completion). */
    costSpentUsd: numeric('cost_spent_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    /**
     * What fired this run.
     * Format: 'cron' | 'event:<event_type>'
     */
    firedBy: text('fired_by').notNull(),
  },
  (t) => [
    /** Schedule history — most recent runs first for a given schedule. */
    index('agent_schedule_run_schedule_started_idx').on(t.scheduleId, t.startedAt.desc()),
    /** Trace correlation — join with agent_cost_event by trace_id. */
    index('agent_schedule_run_tenant_trace_idx').on(t.tenantId, t.traceId),
  ],
)

export type AgentScheduleRunRow = typeof agentScheduleRun.$inferSelect
export type NewAgentScheduleRunRow = typeof agentScheduleRun.$inferInsert
