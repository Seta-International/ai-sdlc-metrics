import { Unauthorized } from '@seta/middleware'
import type { Sql } from 'postgres'
import type { TokenBundle, TokenVault } from './vault.js'

export type RefreshFn = (bundle: TokenBundle) => Promise<TokenBundle>

export class NoTokenForTenant extends Unauthorized {
  constructor(tenantId: string, providerId: string, partitionKey: string) {
    super(`no token for ${tenantId}/${providerId}/${partitionKey}`)
  }
}

export type AcquireTokenInput = {
  tenantId: string
  providerId: string
  partitionKey: string
}

export interface TokenAcquirer {
  acquireToken(input: AcquireTokenInput): Promise<TokenBundle>
}

export type CreateTokenAcquirerDeps = {
  sql: Sql
  vault: TokenVault
  refresh: RefreshFn
  /** How many seconds before expiry we treat the token as needing refresh. Default 300. */
  refreshLeadSec?: number
}

export function createTokenAcquirer(deps: CreateTokenAcquirerDeps): TokenAcquirer {
  const { sql, vault, refresh } = deps
  const leadMs = (deps.refreshLeadSec ?? 300) * 1000

  return {
    async acquireToken({ tenantId, providerId, partitionKey }) {
      return (await sql.begin(async (tx) => {
        const rows = await tx<{ expires_at: Date }[]>`
          SELECT expires_at
            FROM oauth.oauth_tokens
           WHERE tenant_id = ${tenantId}
             AND provider_id = ${providerId}
             AND partition_key = ${partitionKey}
           FOR UPDATE
        `
        if (rows.length === 0) {
          throw new NoTokenForTenant(tenantId, providerId, partitionKey)
        }
        const r = rows[0]
        if (!r) throw new NoTokenForTenant(tenantId, providerId, partitionKey)
        const expiresAt = new Date(r.expires_at)
        const stillFresh = expiresAt.getTime() - Date.now() > leadMs
        if (stillFresh) {
          const existing = await vault.get(tenantId, providerId, partitionKey, tx as unknown as Sql)
          if (!existing) throw new NoTokenForTenant(tenantId, providerId, partitionKey)
          return existing
        }

        const stale = await vault.get(tenantId, providerId, partitionKey, tx as unknown as Sql)
        if (!stale) throw new NoTokenForTenant(tenantId, providerId, partitionKey)

        const refreshed = await refresh(stale)
        await vault.put(tenantId, providerId, partitionKey, refreshed, tx as unknown as Sql)
        return refreshed
      })) as TokenBundle
    },
  }
}
