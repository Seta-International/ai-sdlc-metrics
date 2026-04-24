import { describe, it, expect } from 'vitest'
import { agentSchedule } from './agent-schedule.schema'

describe('Plan 09 — agent_schedule schema', () => {
  it('agentSchedule is defined', () => {
    expect(agentSchedule).toBeDefined()
  })

  it('agentSchedule has expected columns', () => {
    const cols = Object.keys(agentSchedule)
    expect(cols).toContain('id')
    expect(cols).toContain('tenantId')
    expect(cols).toContain('kind')
    expect(cols).toContain('ownerUserId')
    expect(cols).toContain('createdBy')
    expect(cols).toContain('triggerKind')
    expect(cols).toContain('cronExpression')
    expect(cols).toContain('eventSubscription')
    expect(cols).toContain('prompt')
    expect(cols).toContain('delegationId')
    expect(cols).toContain('costCeilingDailyUsd')
    expect(cols).toContain('invocationCeilingDaily')
    expect(cols).toContain('status')
    expect(cols).toContain('pauseReason')
    expect(cols).toContain('consecutiveFailureCount')
    expect(cols).toContain('failureAlertPolicy')
    expect(cols).toContain('createdAt')
    expect(cols).toContain('updatedAt')
  })

  it('agentSchedule status column has default "active"', () => {
    const col = agentSchedule.status
    expect((col as unknown as { default: unknown }).default).toBe('active')
  })

  it('agentSchedule consecutiveFailureCount column has default 0', () => {
    const col = agentSchedule.consecutiveFailureCount
    expect((col as unknown as { default: unknown }).default).toBe(0)
  })

  it('agentSchedule invocationCeilingDaily column has default 10', () => {
    const col = agentSchedule.invocationCeilingDaily
    expect((col as unknown as { default: unknown }).default).toBe(10)
  })

  it('agentSchedule failureAlertPolicy column has default "owner_and_admin"', () => {
    const col = agentSchedule.failureAlertPolicy
    expect((col as unknown as { default: unknown }).default).toBe('owner_and_admin')
  })

  it('agentSchedule has tenant_id for RLS', () => {
    expect(Object.keys(agentSchedule)).toContain('tenantId')
  })
})
