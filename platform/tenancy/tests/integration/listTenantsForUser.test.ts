import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { listTenantsForUser } from '../../src/service'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    // Default in dev — keep visible.
  }
})

afterAll(async () => {
  await sql.end()
})

beforeEach(async () => {
  await sql`TRUNCATE tenant.tenant_members CASCADE`
  await sql`TRUNCATE tenant.tenants CASCADE`
})

describe('listTenantsForUser', () => {
  it('returns rows joined by tenant_members + tenants for the given user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const tA = '22222222-2222-2222-2222-22222222aaaa'
    await sql`
      INSERT INTO tenant.tenants (id, slug, display_name)
      VALUES (${tA}, 'acme', 'Acme')
    `
    await sql`
      INSERT INTO tenant.tenant_members (user_id, tenant_id, role)
      VALUES (${userId}, ${tA}, 'admin')
    `

    const rows = await listTenantsForUser(sql, userId)
    expect(rows).toEqual([{ id: tA, name: 'Acme', role: 'admin' }])
  })

  it('returns [] for a user with no memberships', async () => {
    const rows = await listTenantsForUser(sql, '99999999-9999-9999-9999-999999999999')
    expect(rows).toEqual([])
  })
})
