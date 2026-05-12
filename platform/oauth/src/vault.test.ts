import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { EnvDekProvider } from './kms'
import { createTokenVault, KmsAuthTagInvalid, type TokenBundle } from './vault'

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

  it('rejects swap attack — different partition_key fails decrypt', async () => {
    const victim: TokenBundle = {
      accessToken: 'swap-target',
      refreshToken: null,
      scopes: [],
      expiresAt: new Date(Date.now() + 60_000),
      meta: {},
    }
    await vault.put(tenantId, 'entra', 'user:victim', victim)

    const attacker: TokenBundle = {
      accessToken: 'attacker',
      refreshToken: null,
      scopes: [],
      expiresAt: new Date(Date.now() + 60_000),
      meta: {},
    }
    await vault.put(tenantId, 'entra', 'user:attacker', attacker)

    // Simulate row-level swap: copy victim's encrypted columns onto attacker's row.
    await sql`
      UPDATE oauth.oauth_tokens
         SET wrapped_dek = (SELECT wrapped_dek FROM oauth.oauth_tokens WHERE partition_key = 'user:victim' AND tenant_id = ${tenantId} AND provider_id = 'entra'),
             iv          = (SELECT iv          FROM oauth.oauth_tokens WHERE partition_key = 'user:victim' AND tenant_id = ${tenantId} AND provider_id = 'entra'),
             auth_tag    = (SELECT auth_tag    FROM oauth.oauth_tokens WHERE partition_key = 'user:victim' AND tenant_id = ${tenantId} AND provider_id = 'entra'),
             ciphertext  = (SELECT ciphertext  FROM oauth.oauth_tokens WHERE partition_key = 'user:victim' AND tenant_id = ${tenantId} AND provider_id = 'entra')
       WHERE partition_key = 'user:attacker' AND tenant_id = ${tenantId} AND provider_id = 'entra'
    `

    // Reading attacker's partition with the swapped ciphertext must fail —
    // AAD bound to (tenant|provider|partition|v1) won't match at decrypt time.
    await expect(vault.get(tenantId, 'entra', 'user:attacker')).rejects.toBeInstanceOf(
      KmsAuthTagInvalid,
    )

    // Clean up
    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${tenantId}`
  })
})
