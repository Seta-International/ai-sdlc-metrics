import { describe, expect, it } from 'vitest'
import { plannerConnector } from './manifest'

describe('plannerConnector manifest', () => {
  it('declares the Planner scopes from the spec', () => {
    expect(plannerConnector.id).toBe('ms365-planner')
    expect(plannerConnector.providerId).toBe('entra')
    expect([...plannerConnector.requiredScopes.delegated].sort()).toEqual(
      ['Group.Read.All', 'Group.ReadWrite.All', 'Tasks.ReadWrite'].sort(),
    )
    expect([...plannerConnector.requiredScopes.application].sort()).toEqual(
      ['Group.Read.All', 'Tasks.Read.All'].sort(),
    )
    expect(plannerConnector.capabilities.writes).toBe(true)
    expect(plannerConnector.capabilities.syncable).toBe(true)
  })
})
