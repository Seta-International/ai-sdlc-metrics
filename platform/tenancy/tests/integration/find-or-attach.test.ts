import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findOrAttachUser } from '../../src/service/find-or-attach'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

const tenantId = '00000000-0000-0000-0000-000000000202'
const superUser = '00000000-0000-0000-0000-000000000301'
const memberUser = '00000000-0000-0000-0000-000000000302'
const lonelyUser = '00000000-0000-0000-0000-000000000303'

beforeAll(async () => {
  await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${superUser}, ${memberUser}, ${lonelyUser})`
  await sql`DELETE FROM auth.superadmins WHERE user_id IN (${superUser}, ${memberUser}, ${lonelyUser})`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
  await sql`DELETE FROM auth.users WHERE id IN (${superUser}, ${memberUser}, ${lonelyUser})`

  await sql`INSERT INTO tenant.tenants (id, slug) VALUES (${tenantId}, 'fa-test')`
  await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES
    (${superUser}, 's1@x', 'S', 'entra'),
    (${memberUser}, 'm1@x', 'M', 'entra'),
    (${lonelyUser}, 'n1@x', 'N', 'entra')`
  await sql`INSERT INTO auth.superadmins (user_id) VALUES (${superUser})`
  await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source) VALUES
    (${memberUser}, ${tenantId}, 'member', 'directory_sync')`
})

afterAll(async () => {
  await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${superUser}, ${memberUser}, ${lonelyUser})`
  await sql`DELETE FROM auth.superadmins WHERE user_id IN (${superUser}, ${memberUser}, ${lonelyUser})`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
  await sql`DELETE FROM auth.users WHERE id IN (${superUser}, ${memberUser}, ${lonelyUser})`
  await sql.end()
})

describe('findOrAttachUser', () => {
  it('returns superadmin for users in auth.superadmins', async () => {
    expect(await findOrAttachUser(sql, superUser)).toBe('superadmin')
  })

  it('returns attached for users with tenant_members row', async () => {
    expect(await findOrAttachUser(sql, memberUser)).toBe('attached')
  })

  it('returns no-membership otherwise', async () => {
    expect(await findOrAttachUser(sql, lonelyUser)).toBe('no-membership')
  })

  it('prioritizes superadmin over membership', async () => {
    // edge: a user could in theory be both. The function checks superadmin first.
    await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source) VALUES
      (${superUser}, ${tenantId}, 'member', 'manual')`
    expect(await findOrAttachUser(sql, superUser)).toBe('superadmin')
  })
})
