import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMeContextProvider } from '../../src/service/resolve-me-context'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

const tenantId = '00000000-0000-0000-0000-000000000400'
const superUser = '00000000-0000-0000-0000-000000004601'
const memberUser = '00000000-0000-0000-0000-000000004602'
const adminUser = '00000000-0000-0000-0000-000000004603'
const orphanUser = '00000000-0000-0000-0000-000000004604'

beforeAll(async () => {
  await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${superUser}, ${memberUser}, ${adminUser}, ${orphanUser})`
  await sql`DELETE FROM auth.superadmins WHERE user_id IN (${superUser}, ${memberUser}, ${adminUser}, ${orphanUser})`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
  await sql`DELETE FROM auth.users WHERE id IN (${superUser}, ${memberUser}, ${adminUser}, ${orphanUser})`

  await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'rmc-test', 'RMC Test')`
  await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES
    (${superUser},  'rmc-super@seta-test.internal',  'S', 'entra'),
    (${memberUser}, 'rmc-member@seta-test.internal', 'M', 'entra'),
    (${adminUser},  'rmc-admin@seta-test.internal',  'A', 'entra'),
    (${orphanUser}, 'rmc-orphan@seta-test.internal', 'O', 'entra')`
  await sql`INSERT INTO auth.superadmins (user_id) VALUES (${superUser})`
  await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source) VALUES
    (${memberUser}, ${tenantId}, 'member', 'directory_sync'),
    (${adminUser},  ${tenantId}, 'admin',  'seed')`
})

afterAll(async () => {
  await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${superUser}, ${memberUser}, ${adminUser}, ${orphanUser})`
  await sql`DELETE FROM auth.superadmins WHERE user_id IN (${superUser}, ${memberUser}, ${adminUser}, ${orphanUser})`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
  await sql`DELETE FROM auth.users WHERE id IN (${superUser}, ${memberUser}, ${adminUser}, ${orphanUser})`
  await sql.end()
})

describe('resolveMeContext', () => {
  const provider = createMeContextProvider({ sql, deployedApps: ['studio'] })

  it('member: returns tenant + apps; isAdmin=false', async () => {
    const ctx = await provider.resolve(memberUser)
    expect(ctx.isSuperadmin).toBe(false)
    expect(ctx.tenant?.slug).toBe('rmc-test')
    expect(ctx.tenant?.isAdmin).toBe(false)
    expect(ctx.apps).toEqual(['studio'])
  })

  it('admin: returns tenant with isAdmin=true', async () => {
    const ctx = await provider.resolve(adminUser)
    expect(ctx.tenant?.isAdmin).toBe(true)
    expect(ctx.apps).toEqual(['studio'])
  })

  it('superadmin: tenant null, apps empty', async () => {
    const ctx = await provider.resolve(superUser)
    expect(ctx.isSuperadmin).toBe(true)
    expect(ctx.tenant).toBeNull()
    expect(ctx.apps).toEqual([])
  })

  it('no-membership: tenant null, isSuperadmin false, apps empty', async () => {
    const ctx = await provider.resolve(orphanUser)
    expect(ctx.isSuperadmin).toBe(false)
    expect(ctx.tenant).toBeNull()
    expect(ctx.apps).toEqual([])
  })
})
