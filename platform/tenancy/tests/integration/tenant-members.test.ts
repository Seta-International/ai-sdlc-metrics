import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { recordConsent } from '../../src/service'

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

describe('recordConsent', () => {
  it('throws NotFound when tenant does not exist', async () => {
    await expect(
      recordConsent(sql as never, {
        tenantId: '00000000-0000-0000-0000-000000000099',
        connectorIds: ['ms365-planner'],
        scopesGranted: { delegated: [], application: [] },
      }),
    ).rejects.toThrow(/tenant not found/i)
  })

  it('inserts consent rows when tenant exists', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000300'
    await sql`INSERT INTO tenant.tenants (id, slug) VALUES (${tenantId}, 'rc-test')`
    await recordConsent(sql as never, {
      tenantId,
      connectorIds: ['ms365-planner'],
      scopesGranted: { delegated: ['User.Read'], application: [] },
    })
    const rows = (await sql`
      SELECT status, connector_id FROM tenant.tenant_connectors WHERE tenant_id = ${tenantId}
    `) as Array<{ status: string; connector_id: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('active')
  })
})
