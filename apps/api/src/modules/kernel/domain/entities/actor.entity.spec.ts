import { describe, expect, it } from 'vitest'
import type { Actor } from './actor.entity'
import { isActorActive, isActorArchived } from './actor.entity'

const base: Actor = {
  id: '01900000-0000-7fff-8000-000000000001',
  tenantId: '01900000-0000-7fff-8000-000000000002',
  type: 'person',
  displayName: 'Alice',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('isActorActive', () => {
  it('returns true for active actors', () => {
    expect(isActorActive({ ...base, status: 'active' })).toBe(true)
  })

  it('returns false for non-active statuses', () => {
    for (const status of ['invited', 'inactive', 'suspended', 'archived'] as const) {
      expect(isActorActive({ ...base, status })).toBe(false)
    }
  })
})

describe('isActorArchived', () => {
  it('returns true for archived actors', () => {
    expect(isActorArchived({ ...base, status: 'archived' })).toBe(true)
  })

  it('returns false for non-archived statuses', () => {
    for (const status of ['invited', 'active', 'inactive', 'suspended'] as const) {
      expect(isActorArchived({ ...base, status })).toBe(false)
    }
  })
})
