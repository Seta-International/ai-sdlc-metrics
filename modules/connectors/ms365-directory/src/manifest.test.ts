import { describe, expect, it } from 'vitest'
import { directoryConnector } from './manifest'

describe('directoryConnector manifest', () => {
  it('declares directory scopes', () => {
    expect(directoryConnector.id).toBe('ms365-directory')
    expect(directoryConnector.requiredScopes.delegated).toEqual(['User.Read'])
    expect([...directoryConnector.requiredScopes.application].sort()).toEqual(
      ['Group.Read.All', 'User.Read.All'].sort(),
    )
    expect(directoryConnector.capabilities.writes).toBe(false)
    expect(directoryConnector.capabilities.syncable).toBe(true)
  })
})
