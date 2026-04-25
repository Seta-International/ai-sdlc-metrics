/**
 * readiness-repositories.spec.ts — Plan 13 Task 2
 *
 * Domain-level unit tests for the 5 readiness harness repository interfaces.
 *
 * Tests verify:
 *   1. All repository symbols are defined
 *   2. GA_READINESS_SINGLETON_ID matches the expected well-known UUID
 *   3. All RunbookId literal values are correct
 *   4. Entity shape compatibility via satisfies checks
 */

import { describe, it, expect } from 'vitest'
import { READINESS_CHECK_REPOSITORY, type ReadinessCheckEntity } from './readiness-check.repository'
import {
  RUNBOOK_DRY_RUN_REPOSITORY,
  type RunbookDryRunEntity,
  type RunbookId,
  type RunbookOutcome,
} from './runbook-dry-run.repository'
import {
  GA_READINESS_STATE_REPOSITORY,
  GA_READINESS_SINGLETON_ID,
  type GaReadinessStateEntity,
} from './ga-readiness-state.repository'
import { P1_INCIDENT_REPOSITORY, type P1IncidentEntity } from './p1-incident.repository'
import {
  COST_RECONCILIATION_REPOSITORY,
  type CostReconciliationEntity,
} from './cost-reconciliation.repository'

// ─── Symbol definitions ───────────────────────────────────────────────────────

describe('Repository symbols', () => {
  it('READINESS_CHECK_REPOSITORY is a Symbol', () => {
    expect(typeof READINESS_CHECK_REPOSITORY).toBe('symbol')
    expect(READINESS_CHECK_REPOSITORY.toString()).toBe('Symbol(READINESS_CHECK_REPOSITORY)')
  })

  it('RUNBOOK_DRY_RUN_REPOSITORY is a Symbol', () => {
    expect(typeof RUNBOOK_DRY_RUN_REPOSITORY).toBe('symbol')
    expect(RUNBOOK_DRY_RUN_REPOSITORY.toString()).toBe('Symbol(RUNBOOK_DRY_RUN_REPOSITORY)')
  })

  it('GA_READINESS_STATE_REPOSITORY is a Symbol', () => {
    expect(typeof GA_READINESS_STATE_REPOSITORY).toBe('symbol')
    expect(GA_READINESS_STATE_REPOSITORY.toString()).toBe('Symbol(GA_READINESS_STATE_REPOSITORY)')
  })

  it('P1_INCIDENT_REPOSITORY is a Symbol', () => {
    expect(typeof P1_INCIDENT_REPOSITORY).toBe('symbol')
    expect(P1_INCIDENT_REPOSITORY.toString()).toBe('Symbol(P1_INCIDENT_REPOSITORY)')
  })

  it('COST_RECONCILIATION_REPOSITORY is a Symbol', () => {
    expect(typeof COST_RECONCILIATION_REPOSITORY).toBe('symbol')
    expect(COST_RECONCILIATION_REPOSITORY.toString()).toBe('Symbol(COST_RECONCILIATION_REPOSITORY)')
  })
})

// ─── GA_READINESS_SINGLETON_ID ────────────────────────────────────────────────

describe('GA_READINESS_SINGLETON_ID', () => {
  it('matches the expected well-known UUID', () => {
    expect(GA_READINESS_SINGLETON_ID).toBe('00000000-0000-0000-0000-000000000013')
  })

  it('is a valid UUID-shaped string', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    expect(GA_READINESS_SINGLETON_ID).toMatch(uuidPattern)
  })
})

// ─── RunbookId values ─────────────────────────────────────────────────────────

describe('RunbookId values', () => {
  const ALL_RUNBOOK_IDS: RunbookId[] = [
    'provider_outage',
    'budget_exhaustion_midflight',
    'quality_canary_degradation',
    'cross_tenant_leak_alert',
    'content_hash_store_miss',
    'adapter_dropped_cache_fields',
    'approval_inbox_flood',
    'gdpr_erasure_partial_success',
  ]

  it('contains exactly 8 runbook IDs', () => {
    expect(ALL_RUNBOOK_IDS).toHaveLength(8)
  })

  it('contains all expected runbook ID strings', () => {
    expect(ALL_RUNBOOK_IDS).toContain('provider_outage')
    expect(ALL_RUNBOOK_IDS).toContain('budget_exhaustion_midflight')
    expect(ALL_RUNBOOK_IDS).toContain('quality_canary_degradation')
    expect(ALL_RUNBOOK_IDS).toContain('cross_tenant_leak_alert')
    expect(ALL_RUNBOOK_IDS).toContain('content_hash_store_miss')
    expect(ALL_RUNBOOK_IDS).toContain('adapter_dropped_cache_fields')
    expect(ALL_RUNBOOK_IDS).toContain('approval_inbox_flood')
    expect(ALL_RUNBOOK_IDS).toContain('gdpr_erasure_partial_success')
  })
})

// ─── RunbookOutcome values ────────────────────────────────────────────────────

describe('RunbookOutcome values', () => {
  it('accepts valid outcome values', () => {
    const outcomes: RunbookOutcome[] = ['pass', 'pass_with_notes', 'fail']
    expect(outcomes).toHaveLength(3)
  })
})

// ─── Entity shape type-level checks ──────────────────────────────────────────
// These use `satisfies` so TypeScript validates the shape at compile time.
// At runtime they are just truthy checks confirming the objects were constructed.

describe('Entity shape compatibility', () => {
  it('ReadinessCheckEntity is constructable with all required fields', () => {
    const entity = {
      id: '00000000-0000-0000-0000-000000000001',
      criterionId: 'criterion.golden_trace_coverage',
      windowStart: new Date('2026-04-18T00:00:00Z'),
      windowEnd: new Date('2026-04-25T00:00:00Z'),
      observedValue: '18',
      threshold: '20',
      passed: false,
      notes: null,
      computedAt: new Date('2026-04-25T12:00:00Z'),
    } satisfies ReadinessCheckEntity

    expect(entity.criterionId).toBe('criterion.golden_trace_coverage')
    expect(entity.passed).toBe(false)
    expect(entity.notes).toBeNull()
  })

  it('RunbookDryRunEntity is constructable with all required fields', () => {
    const entity = {
      id: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000099',
      runbookId: 'provider_outage' as RunbookId,
      executedAt: new Date('2026-04-25T09:00:00Z'),
      executedBy: '00000000-0000-0000-0000-000000000003',
      outcome: 'pass' as RunbookOutcome,
      postMortemUrl: null,
      timeToRecoveryMinutes: 15,
    } satisfies RunbookDryRunEntity

    expect(entity.runbookId).toBe('provider_outage')
    expect(entity.outcome).toBe('pass')
    expect(entity.postMortemUrl).toBeNull()
  })

  it('GaReadinessStateEntity is constructable with all required fields', () => {
    const entity = {
      id: GA_READINESS_SINGLETON_ID,
      isGaReady: false,
      computedAt: new Date('2026-04-25T12:00:00Z'),
      missingCriteria: [
        { criterionId: 'criterion.runbook_coverage', reason: 'only 6 of 8 covered' },
      ],
      consecutiveWindowsMet: 3,
      tenantCount: 42,
      interactiveTurnsPerDay: 1500,
      p1SecurityIncidentsLast90d: 1,
    } satisfies GaReadinessStateEntity

    expect(entity.id).toBe(GA_READINESS_SINGLETON_ID)
    expect(entity.missingCriteria).toHaveLength(1)
  })

  it('P1IncidentEntity is constructable with all required fields', () => {
    const entity = {
      id: '00000000-0000-0000-0000-000000000004',
      tenantId: '00000000-0000-0000-0000-000000000099',
      openedAt: new Date('2026-04-20T08:00:00Z'),
      closedAt: null,
      severity: 'P1' as const,
      category: 'security' as const,
      summary: 'Cross-tenant data visible in API response',
      postMortemUrl: null,
    } satisfies P1IncidentEntity

    expect(entity.severity).toBe('P1')
    expect(entity.category).toBe('security')
    expect(entity.closedAt).toBeNull()
  })

  it('CostReconciliationEntity is constructable with all required fields', () => {
    const entity = {
      id: '00000000-0000-0000-0000-000000000005',
      weekStart: '2026-04-20',
      agentCostEventSumUsd: '1234.567890',
      vendorInvoiceSumUsd: '1250.000000',
      divergencePct: '1.2300',
      divergenceOverThreshold: false,
      computedAt: new Date('2026-04-25T12:00:00Z'),
    } satisfies CostReconciliationEntity

    expect(entity.weekStart).toBe('2026-04-20')
    expect(entity.divergenceOverThreshold).toBe(false)
    expect(typeof entity.agentCostEventSumUsd).toBe('string')
  })
})
