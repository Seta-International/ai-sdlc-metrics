import { describe, expect, it } from 'vitest'
import { OWNER_ORDER } from './migrate'

describe('migration runner', () => {
  it('applies owners in dependency order', () => {
    expect([...OWNER_ORDER]).toEqual([
      'auth',
      'tenant',
      'directory',
      'oauth',
      'audit',
      'connector_ms365_directory',
      'connector_ms365_planner',
      'agent',
    ])
  })
})
