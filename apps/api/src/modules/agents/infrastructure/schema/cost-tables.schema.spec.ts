import { describe, it, expect } from 'vitest'
import {
  agentPricing,
  agentCostEvents,
  agentTenantBudget,
  agentUserBudget,
  agentRateLimitCounter,
} from './agents.schema'

describe('Plan 05 schema exports', () => {
  it('agentPricing has expected columns', () => {
    const cols = Object.keys(agentPricing)
    expect(cols).toContain('id')
    expect(cols).toContain('modelId')
    expect(cols).toContain('inputUsdPerMtok')
    expect(cols).toContain('inputCachedReadUsdPerMtok')
    expect(cols).toContain('inputCachedWriteUsdPerMtok')
    expect(cols).toContain('outputUsdPerMtok')
    expect(cols).toContain('outputReasoningUsdPerMtok')
    expect(cols).toContain('effectiveFrom')
    expect(cols).toContain('effectiveUntil')
  })

  it('agentPricing has no tenant_id (global reference data)', () => {
    const cols = Object.keys(agentPricing)
    expect(cols).not.toContain('tenantId')
  })

  it('agentCostEvents has expected columns', () => {
    const cols = Object.keys(agentCostEvents)
    expect(cols).toContain('id')
    expect(cols).toContain('traceId')
    expect(cols).toContain('tenantId')
    expect(cols).toContain('userId')
    expect(cols).toContain('pricingId')
    expect(cols).toContain('pricedAt')
    expect(cols).toContain('modelId')
    expect(cols).toContain('usageInputUncached')
    expect(cols).toContain('usageInputCachedRead')
    expect(cols).toContain('usageInputCachedWrite')
    expect(cols).toContain('usageOutput')
    expect(cols).toContain('usageOutputReasoning')
    expect(cols).toContain('costUsd')
    expect(cols).toContain('layer')
    expect(cols).toContain('retryCount')
    expect(cols).toContain('attemptDurationMs')
    expect(cols).toContain('totalDurationMs')
    expect(cols).toContain('createdAt')
  })

  it('agentTenantBudget has expected columns', () => {
    const cols = Object.keys(agentTenantBudget)
    expect(cols).toContain('tenantId')
    expect(cols).toContain('dailyLimitUsd')
    expect(cols).toContain('remainingUsd')
    expect(cols).toContain('lastRefilledAt')
    expect(cols).toContain('updatedAt')
  })

  it('agentUserBudget has expected columns', () => {
    const cols = Object.keys(agentUserBudget)
    expect(cols).toContain('tenantId')
    expect(cols).toContain('userId')
    expect(cols).toContain('date')
    expect(cols).toContain('dailyLimitUsd')
    expect(cols).toContain('remainingUsd')
    expect(cols).toContain('updatedAt')
  })

  it('agentRateLimitCounter has expected columns', () => {
    const cols = Object.keys(agentRateLimitCounter)
    expect(cols).toContain('tenantId')
    expect(cols).toContain('userId')
    expect(cols).toContain('limitKey')
    expect(cols).toContain('bucket')
    expect(cols).toContain('count')
    expect(cols).toContain('updatedAt')
  })

  it('all tables with tenant scope have tenantId', () => {
    for (const table of [
      agentCostEvents,
      agentTenantBudget,
      agentUserBudget,
      agentRateLimitCounter,
    ]) {
      expect(Object.keys(table)).toContain('tenantId')
    }
  })
})
