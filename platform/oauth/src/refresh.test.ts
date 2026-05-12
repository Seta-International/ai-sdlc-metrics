import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { EnvDekProvider } from './kms.js'
import { createTokenAcquirer } from './refresh.js'
import { createTokenVault } from './vault.js'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('acquireToken — single-flight refresh', () => {
  const sql = postgres(URL, { max: 5, prepare: false })
  const kms = new EnvDekProvider({ keyId: 'local', plaintextKey: Buffer.alloc(32, 11) })
  const vault = createTokenVault({ sql, kms })

  const tenantId = '55555555-5555-5555-5555-555555555555'

  afterAll(async () => {
    await sql`DELETE FROM oauth.oauth_tokens WHERE tenant_id = ${tenantId}`
    await sql.end()
  })

  it('calls provider.refresh exactly once even under concurrent acquireToken', async () => {
    const partition = 'user:concurrent'

    await vault.put(tenantId, 'entra', partition, {
      accessToken: 'old',
      refreshToken: 'r',
      scopes: ['Tasks.ReadWrite'],
      expiresAt: new Date(Date.now() - 1000),
      meta: {},
    })

    let refreshCalls = 0
    const acquirer = createTokenAcquirer({
      sql,
      vault,
      refreshLeadSec: 10,
      refresh: async (bundle) => {
        refreshCalls += 1
        await new Promise((r) => setTimeout(r, 50))
        return {
          ...bundle,
          accessToken: `new-${refreshCalls}`,
          expiresAt: new Date(Date.now() + 60_000),
        }
      },
    })

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        acquirer.acquireToken({ tenantId, providerId: 'entra', partitionKey: partition }),
      ),
    )

    expect(refreshCalls).toBe(1)
    expect(results.every((r) => r.accessToken === 'new-1')).toBe(true)
  })
})
