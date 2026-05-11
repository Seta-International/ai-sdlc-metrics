import { describe, expect, it } from 'vitest'
import { createPool, withTenant } from './client.js'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('withTenant', () => {
  const sql = createPool(DATABASE_URL)

  it('sets app.tenant_id for the transaction and unsets it after', async () => {
    const tid = '00000000-0000-0000-0000-000000000001'

    const inside = await withTenant(sql, tid, async (tx) => {
      const rows = await tx<{ t: string }[]>`SELECT current_setting('app.tenant_id', true) AS t`
      return rows[0]?.t
    })
    expect(inside).toBe(tid)

    // Outside the transaction the GUC is cleared (SET LOCAL is tx-scoped)
    const outside = await sql<{ t: string }[]>`SELECT current_setting('app.tenant_id', true) AS t`
    expect(outside[0]?.t).toBe('')
  })
})
