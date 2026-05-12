import { describe, expect, it } from 'vitest'
import { type ConnectorDefinition, createConnectorRegistry } from './index'

const plannerStub: ConnectorDefinition = {
  id: 'ms365-planner',
  providerId: 'entra',
  displayName: 'Planner',
  description: '',
  customerFacingRationale: '',
  requiredScopes: {
    delegated: ['Tasks.ReadWrite', 'Group.Read.All'],
    application: ['Tasks.Read.All'],
  },
  capabilities: { syncable: true, writes: true },
}

const dirStub: ConnectorDefinition = {
  id: 'ms365-directory',
  providerId: 'entra',
  displayName: 'Directory',
  description: '',
  customerFacingRationale: '',
  requiredScopes: { delegated: ['User.Read'], application: ['User.Read.All', 'Group.Read.All'] },
  capabilities: { syncable: true, writes: false },
}

describe('ConnectorRegistry', () => {
  it('register + get returns the registered definition', () => {
    const r = createConnectorRegistry()
    r.register(plannerStub)
    expect(r.get('ms365-planner')).toBe(plannerStub)
  })

  it('get throws on unknown id', () => {
    const r = createConnectorRegistry()
    expect(() => r.get('nope')).toThrow(/unknown connector/i)
  })

  it('scopeUnion dedupes across connectors', () => {
    const r = createConnectorRegistry()
    r.register(plannerStub)
    r.register(dirStub)
    const union = r.scopeUnion(['ms365-planner', 'ms365-directory'])
    expect(union.delegated.sort()).toEqual(['Group.Read.All', 'Tasks.ReadWrite', 'User.Read'])
    expect(union.application.sort()).toEqual(['Group.Read.All', 'Tasks.Read.All', 'User.Read.All'])
  })

  it('listByProvider filters', () => {
    const r = createConnectorRegistry()
    r.register(plannerStub)
    r.register(dirStub)
    expect(r.listByProvider('entra')).toHaveLength(2)
    expect(r.listByProvider('google')).toHaveLength(0)
  })

  it('requireConsent uses the injected check', async () => {
    const r = createConnectorRegistry(async (_t, c) => c === 'ms365-planner')
    r.register(plannerStub)
    r.register(dirStub)
    await expect(r.requireConsent('tid', 'ms365-planner')).resolves.toBeUndefined()
    await expect(r.requireConsent('tid', 'ms365-directory')).rejects.toThrow(/not consented/i)
  })

  it('requireConsent without injected check throws a config error', async () => {
    const r = createConnectorRegistry()
    r.register(plannerStub)
    await expect(r.requireConsent('tid', 'ms365-planner')).rejects.toThrow(
      /consentCheck not configured/i,
    )
  })
})
