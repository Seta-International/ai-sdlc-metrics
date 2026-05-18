import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runSeed } from '../../src/seed'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

const tenantId = '00000000-0000-0000-0000-000000000005'
const slug = 'seed-test'
const adminEmail = 'seed-test-admin@example.com'

beforeAll(async () => {
  await sql`DELETE FROM auth.superadmins WHERE user_id IN (SELECT id FROM auth.users WHERE email = ${adminEmail})`
  await sql`DELETE FROM auth.users WHERE email = ${adminEmail}`
  await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
})

afterAll(async () => {
  await sql`DELETE FROM auth.superadmins WHERE user_id IN (SELECT id FROM auth.users WHERE email = ${adminEmail})`
  await sql`DELETE FROM auth.users WHERE email = ${adminEmail}`
  await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
  await sql.end()
})

describe('runSeed', () => {
  it('is idempotent', async () => {
    await runSeed({
      sql,
      tenant: { id: tenantId, slug, name: 'Seed Test' },
      superadminEmails: [adminEmail],
    })
    await runSeed({
      sql,
      tenant: { id: tenantId, slug, name: 'Seed Test' },
      superadminEmails: [adminEmail],
    })

    const tenants =
      (await sql`SELECT count(*)::int AS c FROM tenant.tenants WHERE id = ${tenantId}`) as Array<{
        c: number
      }>
    expect(tenants[0]?.c).toBe(1)

    const supers = (await sql`
      SELECT count(*)::int AS c FROM auth.superadmins
      WHERE user_id IN (SELECT id FROM auth.users WHERE email = ${adminEmail})
    `) as Array<{ c: number }>
    expect(supers[0]?.c).toBe(1)
  })

  it('does not seed tenant_members', async () => {
    await runSeed({ sql, tenant: { id: tenantId, slug, name: 'Seed Test' }, superadminEmails: [] })
    const members =
      (await sql`SELECT count(*)::int AS c FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`) as Array<{
        c: number
      }>
    expect(members[0]?.c).toBe(0)
  })
})
