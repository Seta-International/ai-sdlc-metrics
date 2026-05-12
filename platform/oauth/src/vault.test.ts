import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { EnvDekProvider } from './kms.js'
import { createTokenVault, type TokenBundle } from './vault.js'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const kms = new EnvDekProvider({ keyId: 'local', plaintextKey: Buffer.alloc(32, 9) })

describe('TokenVault', () => {
  const sql = postgres(URL, { max: 5, prepare: false })
  const vault = createTokenVault({ sql, kms })

  const tenantId = '44444444-4444-4444-4444-444444444444'
  const partition = 'user:home-account-1'

  afterAll(async () => {
    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${tenantId}`
    await sql.end()
  })

  it('put then get round-trips the bundle', async () => {
    const bundle: TokenBundle = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      scopes: ['Tasks.ReadWrite'],
      expiresAt: new Date(Date.now() + 60_000),
      meta: { tid: 'tid-x' },
    }
    await vault.put(tenantId, 'entra', partition, bundle)
    const out = await vault.get(tenantId, 'entra', partition)
    expect(out?.accessToken).toBe('access-1')
    expect(out?.refreshToken).toBe('refresh-1')
    expect(out?.scopes).toEqual(['Tasks.ReadWrite'])
    expect(out?.meta).toMatchObject({ tid: 'tid-x' })
  })

  it('get returns null for unknown partition', async () => {
    const out = await vault.get(tenantId, 'entra', 'nope')
    expect(out).toBeNull()
  })

  it('delete removes the row', async () => {
    await vault.delete(tenantId, 'entra', partition)
    const out = await vault.get(tenantId, 'entra', partition)
    expect(out).toBeNull()
  })
})
