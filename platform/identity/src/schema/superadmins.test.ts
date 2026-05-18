import { describe, expect, it } from 'vitest'
import { superadmins } from './superadmins'

describe('auth.superadmins schema', () => {
  it('is defined under the auth schema', () => {
    expect(superadmins.userId.name).toBe('user_id')
    expect(superadmins.grantedAt.name).toBe('granted_at')
    expect(superadmins.grantedBy.name).toBe('granted_by')
  })
})
