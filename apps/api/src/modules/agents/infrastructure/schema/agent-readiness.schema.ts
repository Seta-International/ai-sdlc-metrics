/**
 * Plan 13 — Production Readiness Validation Harness
 *
 * These 5 tables are platform-level harness tables: they measure the system
 * as a whole, not per-tenant data.
 *
 * tenant_id exception (approved in Plan 13 design):
 *   - agent_readiness_check, agent_ga_readiness_state, agent_cost_reconciliation
 *     are singleton/system-level tables that track platform-wide invariants.
 *     They intentionally omit tenant_id.
 *   - agent_runbook_dry_run and agent_p1_incident_log CAN be scoped to a
 *     tenant (an incident may affect one tenant; a dry-run may target a
 *     specific tenant environment), so they include tenant_id.
 */
import {
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  numeric,
  date,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { agentsSchema } from './agents.schema'

// ─── agent_readiness_check ────────────────────────────────────────────────────

/**
 * Persisted result of each GA-readiness criterion evaluation.
 *
 * No tenant_id — this is a platform-level table recording system-wide
 * criterion pass/fail results. It is not scoped to any individual tenant.
 */
export const agentReadinessCheck = agentsSchema.table(
  'agent_readiness_check',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    criterionId: text('criterion_id').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    /** Stored as text; numeric values are serialised as text so consumers parse them. */
    observedValue: text('observed_value').notNull(),
    threshold: text('threshold').notNull(),
    passed: boolean('passed').notNull(),
    notes: text('notes'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('agent_readiness_check_criterion_window_idx').on(t.criterionId, t.windowEnd.desc()),
  ],
)

export type AgentReadinessCheckRow = typeof agentReadinessCheck.$inferSelect
export type NewAgentReadinessCheckRow = typeof agentReadinessCheck.$inferInsert

// ─── agent_runbook_dry_run ────────────────────────────────────────────────────

/**
 * Records each operator dry-run execution of a production runbook.
 *
 * tenant_id is included — a dry-run may target a specific tenant
 * environment (e.g. simulating provider outage for tenant X).
 */
export const agentRunbookDryRun = agentsSchema.table(
  'agent_runbook_dry_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    runbookId: text('runbook_id').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
    executedBy: uuid('executed_by').notNull(),
    outcome: text('outcome').notNull(),
    postMortemUrl: text('post_mortem_url'),
    timeToRecoveryMinutes: integer('time_to_recovery_minutes'),
  },
  (t) => [
    index('agent_runbook_dry_run_runbook_executed_idx').on(t.runbookId, t.executedAt.desc()),
    index('agent_runbook_dry_run_tenant_executed_idx').on(t.tenantId, t.executedAt.desc()),
    check(
      'agent_runbook_dry_run_outcome_check',
      sql`${t.outcome} IN ('pass', 'pass_with_notes', 'fail')`,
    ),
    check(
      'agent_runbook_dry_run_runbook_id_check',
      sql`${t.runbookId} IN ('provider_outage', 'budget_exhaustion_midflight', 'quality_canary_degradation', 'cross_tenant_leak_alert', 'content_hash_store_miss', 'adapter_dropped_cache_fields', 'approval_inbox_flood', 'gdpr_erasure_partial_success')`,
    ),
  ],
)

export type AgentRunbookDryRunRow = typeof agentRunbookDryRun.$inferSelect
export type NewAgentRunbookDryRunRow = typeof agentRunbookDryRun.$inferInsert

// ─── agent_ga_readiness_state ─────────────────────────────────────────────────

/**
 * Single operational row updated continuously by the readiness harness.
 *
 * The harness always upserts a fixed well-known UUID so there is effectively
 * one row in this table at all times.
 *
 * No tenant_id — this is a singleton platform-level table reflecting the
 * overall GA readiness state of the system.
 */
export const agentGaReadinessState = agentsSchema.table('agent_ga_readiness_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  isGaReady: boolean('is_ga_ready').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  /** Array of { criterionId: string, reason: string } objects. */
  missingCriteria: jsonb('missing_criteria')
    .notNull()
    .$type<{ criterionId: string; reason: string }[]>(),
  consecutiveWindowsMet: integer('consecutive_windows_met').notNull().default(0),
  windowStartedPassingAt: timestamp('window_started_passing_at', { withTimezone: true }),
  tenantCount: integer('tenant_count').notNull(),
  interactiveTurnsPerDay: integer('interactive_turns_per_day').notNull(),
  p1SecurityIncidentsLast90d: integer('p1_security_incidents_last_90d').notNull(),
})

export type AgentGaReadinessStateRow = typeof agentGaReadinessState.$inferSelect
export type NewAgentGaReadinessStateRow = typeof agentGaReadinessState.$inferInsert

// ─── agent_p1_incident_log ────────────────────────────────────────────────────

/**
 * Log of P1/P2 production incidents tracked by the readiness harness.
 *
 * tenant_id is included — an incident may be scoped to a specific tenant
 * (e.g. a data leak affecting one tenant's sessions).
 */
export const agentP1IncidentLog = agentsSchema.table(
  'agent_p1_incident_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    summary: text('summary').notNull(),
    postMortemUrl: text('post_mortem_url'),
  },
  (t) => [
    index('agent_p1_incident_log_severity_opened_idx').on(t.severity, t.openedAt.desc()),
    check('agent_p1_incident_log_severity_check', sql`${t.severity} IN ('P1', 'P2')`),
    check(
      'agent_p1_incident_log_category_check',
      sql`${t.category} IN ('security', 'reliability', 'cost', 'observability')`,
    ),
  ],
)

export type AgentP1IncidentLogRow = typeof agentP1IncidentLog.$inferSelect
export type NewAgentP1IncidentLogRow = typeof agentP1IncidentLog.$inferInsert

// ─── agent_cost_reconciliation ────────────────────────────────────────────────

/**
 * Weekly cost reconciliation between internal cost events and vendor invoices.
 *
 * No tenant_id — this is a platform-level table that compares aggregate
 * spend across all tenants against a vendor invoice. Individual tenant
 * cost tracking lives in agent_cost_event.
 */
export const agentCostReconciliation = agentsSchema.table(
  'agent_cost_reconciliation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Calendar week start date (e.g. 2026-04-20 for the week beginning Monday). */
    weekStart: date('week_start').notNull(),
    agentCostEventSumUsd: numeric('agent_cost_event_sum_usd', {
      precision: 12,
      scale: 6,
    }).notNull(),
    vendorInvoiceSumUsd: numeric('vendor_invoice_sum_usd', { precision: 12, scale: 6 }).notNull(),
    divergencePct: numeric('divergence_pct', { precision: 8, scale: 4 }).notNull(),
    divergenceOverThreshold: boolean('divergence_over_threshold').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('agent_cost_reconciliation_week_start_idx').on(t.weekStart),
    check(
      'agent_cost_reconciliation_divergence_pct_check',
      sql`${t.divergencePct} >= -100 AND ${t.divergencePct} <= 100`,
    ),
  ],
)

export type AgentCostReconciliationRow = typeof agentCostReconciliation.$inferSelect
export type NewAgentCostReconciliationRow = typeof agentCostReconciliation.$inferInsert
