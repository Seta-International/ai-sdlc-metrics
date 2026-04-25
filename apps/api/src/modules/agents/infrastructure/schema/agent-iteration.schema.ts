import { uuid, text, integer, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { agentsSchema } from './agents.schema'

/**
 * Plan 12 — Per-iteration record for the iterative supervisor loop.
 *
 * One row is inserted at the start of each iteration and updated when the
 * iteration ends.  The pair (turn_id, iteration_number) uniquely identifies
 * an iteration within a turn.
 *
 * `completion_scorer_results` — JSONB array of ScorerResult snapshots taken
 *   after the sub-agent's output is evaluated.  Stored opaquely; shaped by
 *   the domain layer.
 *
 * `usage` — token/cost snapshot for this iteration (not cumulative).
 *   Populated by the orchestrator on iteration end.
 *
 * `taint_at_start` — true when the turn's taint flag was already set before
 *   this iteration began.  Preserves provenance for audit/approval tier bumps.
 */
export const agentIteration = agentsSchema.table(
  'agent_iteration',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    traceId: uuid('trace_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    /** Correlates to the TURN span — links all iterations of one user turn. */
    turnId: uuid('turn_id').notNull(),
    /** 1-based counter within the turn. */
    iterationNumber: integer('iteration_number').notNull(),
    /** Key of the sub-agent that ran during this iteration. */
    subAgentKey: text('sub_agent_key').notNull(),
    /** Router's natural-language rationale for selecting this sub-agent. */
    selectionReason: text('selection_reason').notNull(),
    /**
     * ScorerResult[] snapshot from the completion scorers evaluated after
     * this iteration's sub-agent output.  Stored as JSONB.
     */
    completionScorerResults: jsonb('completion_scorer_results').notNull().default({}),
    /** True when all completion criteria were met after this iteration. */
    isComplete: boolean('is_complete').notNull().default(false),
    /** Wall-clock timestamp when the iteration started. */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Wall-clock timestamp when the iteration ended. NULL until the iteration completes. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /**
     * Per-iteration token/cost snapshot.  Shape mirrors SubAgentUsage from
     * phase-executor-contracts; stored opaquely here.
     */
    usage: jsonb('usage').notNull().default({}),
    /**
     * True when the turn's taint flag was already set at the start of this
     * iteration.  Used by the approval-tier logic to assess risk provenance.
     */
    taintAtStart: boolean('taint_at_start').notNull().default(false),
  },
  (t) => [index('idx_agent_iteration_turn').on(t.turnId, t.iterationNumber)],
)

export type AgentIterationRow = typeof agentIteration.$inferSelect
export type NewAgentIterationRow = typeof agentIteration.$inferInsert
