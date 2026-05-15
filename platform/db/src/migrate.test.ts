import { describe, expect, it } from 'vitest'
import { OWNER_ORDER } from './migrate'

describe('migration runner', () => {
  it('applies owners in dependency order', () => {
    expect([...OWNER_ORDER]).toEqual([
      'identity',
      'tenancy',
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

  it('places tenancy after identity', () => {
    const identityIdx = OWNER_ORDER.indexOf('identity')
    const tenancyIdx = OWNER_ORDER.indexOf('tenancy')
    expect(identityIdx).toBeGreaterThanOrEqual(0)
    expect(tenancyIdx).toBe(identityIdx + 1)
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
