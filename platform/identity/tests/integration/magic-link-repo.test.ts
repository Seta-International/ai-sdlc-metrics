import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { hashToken, mintToken } from '../../src/magic-link'
import { consumeMagicLink, insertMagicLink } from '../../src/magic-link-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

const tenantId = '00000000-0000-4000-8000-0000000000f1'
const userId = '00000000-0000-4000-8000-0000000000f2'

describe('magic-link-repo (integration)', () => {
  beforeEach(async () => {
    await sql`TRUNCATE auth.magic_links, auth.user_identities, auth.users CASCADE`
    await sql`DELETE FROM tenant.tenant_members WHERE user_id = ${userId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
    await sql`
      INSERT INTO auth.users (id, email, name, primary_provider)
      VALUES (${userId}, 'alice@acme.com', 'Alice', 'entra')
    `
  })
  afterAll(async () => {
    await sql.end()
  })

  it('inserts a link and consumes it once', async () => {
    const raw = mintToken()
    await insertMagicLink(sql, {
      userId,
      tenantId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      requestedIp: '127.0.0.1',
    })
    const first = await consumeMagicLink(sql, raw)
    expect(first).toEqual({ userId, tenantId })

    const replay = await consumeMagicLink(sql, raw)
    expect(replay).toBeNull()
  })

  it('returns null for an expired link', async () => {
    const raw = mintToken()
    await insertMagicLink(sql, {
      userId,
      tenantId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() - 1000),
      requestedIp: null,
    })
    expect(await consumeMagicLink(sql, raw)).toBeNull()
  })

  it('returns null for an unknown token', async () => {
    expect(await consumeMagicLink(sql, 'nope')).toBeNull()
  })
})
