import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(url, { onnotice: () => {} })

afterAll(async () => {
  await sql.end()
})

beforeEach(async () => {
  await sql`TRUNCATE tenant.tenant_members CASCADE`
  await sql`TRUNCATE tenant.tenants CASCADE`
})

describe('tenant_members UNIQUE(user_id)', () => {
  it('rejects a second membership row for the same user', async () => {
    const u = '00000000-0000-0000-0000-0000000000a1'
    const t1 = '00000000-0000-0000-0000-000000000010'
    const t2 = '00000000-0000-0000-0000-000000000011'
    await sql`
      INSERT INTO tenant.tenants (id, slug) VALUES (${t1}, 'uut1'), (${t2}, 'uut2')
    `
    await sql`
      INSERT INTO tenant.tenant_members (user_id, tenant_id) VALUES (${u}, ${t1})
    `
    await expect(
      sql`INSERT INTO tenant.tenant_members (user_id, tenant_id) VALUES (${u}, ${t2})`,
    ).rejects.toThrow(/tenant_members_user_unique/i)
  })
})
