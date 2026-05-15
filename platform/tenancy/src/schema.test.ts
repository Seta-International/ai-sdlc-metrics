import { describe, expect, it } from 'vitest'
import { tenantMembers } from './schema'

describe('auth.tenant_members schema', () => {
  it('exposes the expected columns', () => {
    const cols = Object.keys(tenantMembers)
    expect(cols).toEqual(expect.arrayContaining(['userId', 'tenantId', 'role', 'createdAt']))
  })

  it('row select type is the union role', () => {
    type Row = typeof tenantMembers.$inferSelect
    const row: Row = {
      userId: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      role: 'admin',
      createdAt: new Date(),
    }
    expect(row.role).toBe('admin')
  })
})
