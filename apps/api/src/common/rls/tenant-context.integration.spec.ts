import { beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb, migrateForTest, seedTenant } from '@future/db/test-helpers'

const TENANT_A = '01900000-0000-7fff-8000-000000000005'

describe('tenant context', () => {
  const db = createTestDb()

  beforeAll(async () => {
    await migrateForTest()
    await seedTenant(db, { id: TENANT_A, slug: 'ctx-tenant-a' })
  })

  it('current_setting with missing_ok returns null before tenant context is set', async () => {
    const rows = await db.execute<{ val: string | null }>(
      sql`SELECT current_setting('app.tenant_id', true) AS val`,
    )

    expect(rows.rows[0]?.val ?? null).toBeNull()
  })

  it('set_config with false persists on the same connection within a transaction', async () => {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
      const rows = await tx.execute<{ current_setting: string }>(
        sql`SELECT current_setting('app.tenant_id') AS current_setting`,
      )

      return rows.rows[0]?.current_setting
    })

    expect(result).toBe(TENANT_A)
  })
})
