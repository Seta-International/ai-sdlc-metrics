import { describe, expect, it } from 'vitest'
import { OWNER_ORDER } from './migrate'

describe('migration runner', () => {
  it('applies owners in dependency order', () => {
    // Forward-only order per Epic 1 spec §4.1:
    //   auth → tenant → directory → oauth → audit → connector_* → agent
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
