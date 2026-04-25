import { describe, it, expect } from 'vitest'
import {
  agentReadinessCheck,
  agentRunbookDryRun,
  agentGaReadinessState,
  agentP1IncidentLog,
  agentCostReconciliation,
} from './agent-readiness.schema'

describe('Plan 13 — agent_readiness_check schema', () => {
  it('is defined', () => {
    expect(agentReadinessCheck).toBeDefined()
  })

  it('has expected columns', () => {
    const cols = Object.keys(agentReadinessCheck)
    expect(cols).toContain('id')
    expect(cols).toContain('criterionId')
    expect(cols).toContain('windowStart')
    expect(cols).toContain('windowEnd')
    expect(cols).toContain('observedValue')
    expect(cols).toContain('threshold')
    expect(cols).toContain('passed')
    expect(cols).toContain('notes')
    expect(cols).toContain('computedAt')
  })

  it('has no tenantId (platform-level singleton table)', () => {
    const cols = Object.keys(agentReadinessCheck)
    expect(cols).not.toContain('tenantId')
  })

  it('notes column is nullable', () => {
    const col = agentReadinessCheck.notes
    expect(col).toBeDefined()
    // notNull is not set — the column is optional
    expect((col as unknown as { notNull: boolean }).notNull).toBeFalsy()
  })

  it('passed column is boolean', () => {
    const col = agentReadinessCheck.passed
    expect(col).toBeDefined()
    expect((col as unknown as { columnType: string }).columnType).toBe('PgBoolean')
  })
})

describe('Plan 13 — agent_runbook_dry_run schema', () => {
  it('is defined', () => {
    expect(agentRunbookDryRun).toBeDefined()
  })

  it('has expected columns', () => {
    const cols = Object.keys(agentRunbookDryRun)
    expect(cols).toContain('id')
    expect(cols).toContain('tenantId')
    expect(cols).toContain('runbookId')
    expect(cols).toContain('executedAt')
    expect(cols).toContain('executedBy')
    expect(cols).toContain('outcome')
    expect(cols).toContain('postMortemUrl')
    expect(cols).toContain('timeToRecoveryMinutes')
  })

  it('has tenantId (tenant-scoped table)', () => {
    const cols = Object.keys(agentRunbookDryRun)
    expect(cols).toContain('tenantId')
  })

  it('postMortemUrl and timeToRecoveryMinutes are nullable', () => {
    const postMortem = agentRunbookDryRun.postMortemUrl
    const ttr = agentRunbookDryRun.timeToRecoveryMinutes
    expect((postMortem as unknown as { notNull: boolean }).notNull).toBeFalsy()
    expect((ttr as unknown as { notNull: boolean }).notNull).toBeFalsy()
  })

  it('outcome column is text type', () => {
    const col = agentRunbookDryRun.outcome
    expect((col as unknown as { columnType: string }).columnType).toBe('PgText')
  })
})

describe('Plan 13 — agent_ga_readiness_state schema', () => {
  it('is defined', () => {
    expect(agentGaReadinessState).toBeDefined()
  })

  it('has expected columns', () => {
    const cols = Object.keys(agentGaReadinessState)
    expect(cols).toContain('id')
    expect(cols).toContain('isGaReady')
    expect(cols).toContain('computedAt')
    expect(cols).toContain('missingCriteria')
    expect(cols).toContain('consecutiveWindowsMet')
    expect(cols).toContain('tenantCount')
    expect(cols).toContain('interactiveTurnsPerDay')
    expect(cols).toContain('p1SecurityIncidentsLast90d')
  })

  it('has no tenantId (singleton platform-level table)', () => {
    const cols = Object.keys(agentGaReadinessState)
    expect(cols).not.toContain('tenantId')
  })

  it('consecutiveWindowsMet has default 0', () => {
    const col = agentGaReadinessState.consecutiveWindowsMet
    expect((col as unknown as { default: unknown }).default).toBe(0)
  })

  it('missingCriteria is jsonb', () => {
    const col = agentGaReadinessState.missingCriteria
    expect((col as unknown as { columnType: string }).columnType).toBe('PgJsonb')
  })

  it('isGaReady is boolean', () => {
    const col = agentGaReadinessState.isGaReady
    expect((col as unknown as { columnType: string }).columnType).toBe('PgBoolean')
  })
})

describe('Plan 13 — agent_p1_incident_log schema', () => {
  it('is defined', () => {
    expect(agentP1IncidentLog).toBeDefined()
  })

  it('has expected columns', () => {
    const cols = Object.keys(agentP1IncidentLog)
    expect(cols).toContain('id')
    expect(cols).toContain('tenantId')
    expect(cols).toContain('openedAt')
    expect(cols).toContain('closedAt')
    expect(cols).toContain('severity')
    expect(cols).toContain('category')
    expect(cols).toContain('summary')
    expect(cols).toContain('postMortemUrl')
  })

  it('has tenantId (tenant-scoped table)', () => {
    const cols = Object.keys(agentP1IncidentLog)
    expect(cols).toContain('tenantId')
  })

  it('closedAt and postMortemUrl are nullable', () => {
    const closedAt = agentP1IncidentLog.closedAt
    const postMortem = agentP1IncidentLog.postMortemUrl
    expect((closedAt as unknown as { notNull: boolean }).notNull).toBeFalsy()
    expect((postMortem as unknown as { notNull: boolean }).notNull).toBeFalsy()
  })

  it('severity column is text type', () => {
    const col = agentP1IncidentLog.severity
    expect((col as unknown as { columnType: string }).columnType).toBe('PgText')
  })

  it('category column is text type', () => {
    const col = agentP1IncidentLog.category
    expect((col as unknown as { columnType: string }).columnType).toBe('PgText')
  })
})

describe('Plan 13 — agent_cost_reconciliation schema', () => {
  it('is defined', () => {
    expect(agentCostReconciliation).toBeDefined()
  })

  it('has expected columns', () => {
    const cols = Object.keys(agentCostReconciliation)
    expect(cols).toContain('id')
    expect(cols).toContain('weekStart')
    expect(cols).toContain('agentCostEventSumUsd')
    expect(cols).toContain('vendorInvoiceSumUsd')
    expect(cols).toContain('divergencePct')
    expect(cols).toContain('divergenceOverThreshold')
    expect(cols).toContain('computedAt')
  })

  it('has no tenantId (platform-level aggregate table)', () => {
    const cols = Object.keys(agentCostReconciliation)
    expect(cols).not.toContain('tenantId')
  })

  it('weekStart is date type (not timestamp)', () => {
    const col = agentCostReconciliation.weekStart
    // Drizzle's date() column exposes as 'PgDateString' at runtime
    expect((col as unknown as { columnType: string }).columnType).toBe('PgDateString')
  })

  it('divergenceOverThreshold is boolean', () => {
    const col = agentCostReconciliation.divergenceOverThreshold
    expect((col as unknown as { columnType: string }).columnType).toBe('PgBoolean')
  })

  it('agentCostEventSumUsd is numeric type', () => {
    const col = agentCostReconciliation.agentCostEventSumUsd
    expect((col as unknown as { columnType: string }).columnType).toBe('PgNumeric')
  })
})
