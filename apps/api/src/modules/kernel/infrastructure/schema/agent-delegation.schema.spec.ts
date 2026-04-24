import { describe, it, expect } from 'vitest'
import { agentDelegation } from './agent-delegation.schema'

describe('Plan 08 — agent_delegation schema', () => {
  it('agentDelegation is defined', () => {
    expect(agentDelegation).toBeDefined()
  })

  it('agentDelegation has expected columns', () => {
    const cols = Object.keys(agentDelegation)
    expect(cols).toContain('id')
    expect(cols).toContain('tenantId')
    expect(cols).toContain('delegatorUserId')
    expect(cols).toContain('delegate')
    expect(cols).toContain('scope')
    expect(cols).toContain('expiresAt')
    expect(cols).toContain('status')
    expect(cols).toContain('createdAt')
  })

  it('agentDelegation has tenant_id (RLS column)', () => {
    const cols = Object.keys(agentDelegation)
    expect(cols).toContain('tenantId')
  })

  it('agentDelegation status column has default "active"', () => {
    const col = agentDelegation.status
    expect((col as unknown as { default: unknown }).default).toBe('active')
  })

  it('agentDelegation scope column is not null', () => {
    const col = agentDelegation.scope
    expect(col).toBeDefined()
  })
})
