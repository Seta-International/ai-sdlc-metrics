import { describe, expect, it } from 'vitest'
import { OWNER_ORDER } from './migrate'

describe('migration runner', () => {
  it('applies owners in dependency order', () => {
    expect([...OWNER_ORDER]).toEqual([
      'auth',
      'sso',
      'tenant',
      'directory',
      'oauth',
      'audit',
      'connector_ms365_directory',
      'connector_ms365_planner',
      'agent',
      'agent_memory',
      'agent_workflows',
    ])
  })

  it('places sso after auth', () => {
    const authIdx = OWNER_ORDER.indexOf('auth')
    const ssoIdx = OWNER_ORDER.indexOf('sso')
    expect(authIdx).toBeGreaterThanOrEqual(0)
    expect(ssoIdx).toBe(authIdx + 1)
  })

  it('places agent_memory after agent', () => {
    const agentIdx = OWNER_ORDER.indexOf('agent')
    const memIdx = OWNER_ORDER.indexOf('agent_memory')
    expect(agentIdx).toBeGreaterThanOrEqual(0)
    expect(memIdx).toBeGreaterThan(agentIdx)
  })

  it('places agent_workflows after agent_memory', () => {
    const memIdx = OWNER_ORDER.indexOf('agent_memory')
    const wfIdx = OWNER_ORDER.indexOf('agent_workflows')
    expect(memIdx).toBeGreaterThanOrEqual(0)
    expect(wfIdx).toBeGreaterThan(memIdx)
  })
})
