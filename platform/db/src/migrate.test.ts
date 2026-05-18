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
      'planner',
      'analytics',
      'agent_server',
      'agent_memory',
      'agent_workflows',
      'agent_vector',
    ])
  })

  it('places tenancy after identity', () => {
    const identityIdx = OWNER_ORDER.indexOf('identity')
    const tenancyIdx = OWNER_ORDER.indexOf('tenancy')
    expect(identityIdx).toBeGreaterThanOrEqual(0)
    expect(tenancyIdx).toBe(identityIdx + 1)
  })

  it('places agent_memory after agent_server', () => {
    const agentIdx = OWNER_ORDER.indexOf('agent_server')
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

  it('places agent_vector after agent_workflows', () => {
    const wfIdx = OWNER_ORDER.indexOf('agent_workflows')
    const vecIdx = OWNER_ORDER.indexOf('agent_vector')
    expect(wfIdx).toBeGreaterThanOrEqual(0)
    expect(vecIdx).toBeGreaterThan(wfIdx)
  })
})
