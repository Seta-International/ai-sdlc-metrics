import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listMembers, removeMember, setMemberRole } from '../../src/service/members'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

const tenantId = '00000000-0000-0000-0000-000000000200'
const userA = '00000000-0000-0000-0000-00000000a200'
const userB = '00000000-0000-0000-0000-00000000b200'

beforeAll(async () => {
  await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${userA}, ${userB})`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
  await sql`DELETE FROM auth.users WHERE id IN (${userA}, ${userB})`
  await sql`INSERT INTO tenant.tenants (id, slug) VALUES (${tenantId}, 'mt-test')`
  await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES
    (${userA}, 'a200@x', 'Alice', 'entra'),
    (${userB}, 'b200@x', 'Bob', 'entra')`
  await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source) VALUES
    (${userA}, ${tenantId}, 'admin', 'seed'),
    (${userB}, ${tenantId}, 'member', 'directory_sync')`
})

afterAll(async () => {
  await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${userA}, ${userB})`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
  await sql`DELETE FROM auth.users WHERE id IN (${userA}, ${userB})`
  await sql.end()
})

describe('members service', () => {
  it('listMembers returns all rows for tenant', async () => {
    const rows = await listMembers(sql, tenantId)
    expect(rows.find((r) => r.userId === userA)?.role).toBe('admin')
    expect(rows.find((r) => r.userId === userB)?.role).toBe('member')
    expect(rows.find((r) => r.userId === userA)?.source).toBe('seed')
  })

  it('setMemberRole flips a role', async () => {
    const after = await setMemberRole(sql, tenantId, userB, 'admin')
    expect(after.role).toBe('admin')
    const rows = await listMembers(sql, tenantId)
    expect(rows.find((r) => r.userId === userB)?.role).toBe('admin')
  })

  it('removeMember deletes the row', async () => {
    await removeMember(sql, tenantId, userB)
    const rows = await listMembers(sql, tenantId)
    expect(rows.find((r) => r.userId === userB)).toBeUndefined()
  })
})
