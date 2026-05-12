import { describe, expect, it } from 'vitest'
import { createPool, withTenant } from './client'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('withTenant', () => {
  // max: 1 guarantees the post-withTenant probe lands on the same backend as the
  // transaction. Without this, the "outside === ''" assertion only proves a fresh
  // connection has no GUC set — not that set_config(..., true) is tx-scoped.
  const sql = createPool(DATABASE_URL, { max: 1 })

  it('sets app.tenant_id for the transaction and unsets it after commit', async () => {
    const tid = '00000000-0000-0000-0000-000000000001'

    const inside = await withTenant(sql, tid, async (tx) => {
      const rows = await tx<{ t: string }[]>`SELECT current_setting('app.tenant_id', true) AS t`
      return rows[0]?.t
    })
    expect(inside).toBe(tid)

    // With max:1, this query MUST land on the same backend; if SET were used
    // instead of set_config(..., true), the GUC would still be visible.
    const outside = await sql<{ t: string }[]>`SELECT current_setting('app.tenant_id', true) AS t`
    expect(outside[0]?.t).toBe('')
  })

  it('sets app.user_id when userId is provided and unsets it after commit', async () => {
    const tid = '00000000-0000-0000-0000-000000000001'
    const uid = '00000000-0000-0000-0000-000000000002'

    const inside = await withTenant(
      sql,
      tid,
      async (tx) => {
        const rows = await tx<{ u: string }[]>`SELECT current_setting('app.user_id', true) AS u`
        return rows[0]?.u
      },
      uid,
    )
    expect(inside).toBe(uid)

    // app.user_id must not leak outside the transaction (returns '' or null after tx-local set_config)
    const outside = await sql<
      { u: string | null }[]
    >`SELECT current_setting('app.user_id', true) AS u`
    expect(outside[0]?.u == null || outside[0]?.u === '').toBe(true)
  })

  it('leaves app.user_id unset (null or empty) when userId is not provided', async () => {
    const tid = '00000000-0000-0000-0000-000000000001'

    const inside = await withTenant(sql, tid, async (tx) => {
      const rows = await tx<
        { u: string | null }[]
      >`SELECT current_setting('app.user_id', true) AS u`
      return rows[0]?.u
    })
    expect(inside == null || inside === '').toBe(true)
  })
})
