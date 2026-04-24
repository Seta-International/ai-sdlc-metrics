import { describe, it, expect } from 'vitest'
import { agentScheduleRun } from './agent-schedule-run.schema'

describe('Plan 09 — agent_schedule_run schema', () => {
  it('agentScheduleRun is defined', () => {
    expect(agentScheduleRun).toBeDefined()
  })

  it('agentScheduleRun has expected columns', () => {
    const cols = Object.keys(agentScheduleRun)
    expect(cols).toContain('id')
    expect(cols).toContain('scheduleId')
    expect(cols).toContain('tenantId')
    expect(cols).toContain('traceId')
    expect(cols).toContain('flowId')
    expect(cols).toContain('pgBossJobId')
    expect(cols).toContain('startedAt')
    expect(cols).toContain('endedAt')
    expect(cols).toContain('outcome')
    expect(cols).toContain('taintSeeded')
    expect(cols).toContain('pinnedVersions')
    expect(cols).toContain('costSpentUsd')
    expect(cols).toContain('firedBy')
  })

  it('agentScheduleRun taintSeeded column has default false', () => {
    const col = agentScheduleRun.taintSeeded
    expect((col as unknown as { default: unknown }).default).toBe(false)
  })

  it('agentScheduleRun costSpentUsd column has default "0"', () => {
    const col = agentScheduleRun.costSpentUsd
    expect((col as unknown as { default: unknown }).default).toBe('0')
  })

  it('agentScheduleRun has tenant_id for RLS', () => {
    expect(Object.keys(agentScheduleRun)).toContain('tenantId')
  })
})
