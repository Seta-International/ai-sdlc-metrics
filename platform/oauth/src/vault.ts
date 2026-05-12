import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ServiceUnavailable } from '@seta/middleware'
import type { Sql } from 'postgres'
import type { KmsClient } from './kms.js'

export type TokenBundle = {
  accessToken: string
  refreshToken: string | null
  scopes: string[]
  expiresAt: Date
  meta: Record<string, unknown>
}

export interface TokenVault {
  get(tenantId: string, providerId: string, partitionKey: string): Promise<TokenBundle | null>
  put(
    tenantId: string,
    providerId: string,
    partitionKey: string,
    bundle: TokenBundle,
  ): Promise<void>
  delete(tenantId: string, providerId: string, partitionKey: string): Promise<void>
}

export class KmsAuthTagInvalid extends ServiceUnavailable {
  constructor() {
    super('token decrypt failed — auth tag mismatch')
  }
}

export function createTokenVault(deps: { sql: Sql; kms: KmsClient }): TokenVault {
  const { sql, kms } = deps

  return {
    async put(tenantId, providerId, partitionKey, bundle) {
      const dek = await kms.generateDataKey()
      try {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', Buffer.from(dek.plaintext), iv)
        const plaintext = Buffer.from(
          JSON.stringify({
            access: bundle.accessToken,
            refresh: bundle.refreshToken,
            scopes: bundle.scopes,
            expires: bundle.expiresAt.toISOString(),
            meta: bundle.meta,
          }),
          'utf8',
        )
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
        const authTag = cipher.getAuthTag()

        await sql`
          INSERT INTO oauth.oauth_tokens
            (tenant_id, provider_id, partition_key, scope_set, envelope_version,
             kms_key_id, wrapped_dek, iv, auth_tag, ciphertext, expires_at)
          VALUES
            (${tenantId}, ${providerId}, ${partitionKey}, ${sql.json(bundle.scopes as never)}, 1,
             ${dek.keyId}, ${Buffer.from(dek.ciphertextBlob)}, ${iv}, ${authTag}, ${ciphertext},
             ${bundle.expiresAt})
          ON CONFLICT (tenant_id, provider_id, partition_key) DO UPDATE SET
            scope_set        = excluded.scope_set,
            envelope_version = excluded.envelope_version,
            kms_key_id       = excluded.kms_key_id,
            wrapped_dek      = excluded.wrapped_dek,
            iv               = excluded.iv,
            auth_tag         = excluded.auth_tag,
            ciphertext       = excluded.ciphertext,
            expires_at       = excluded.expires_at,
            updated_at       = now()
        `
      } finally {
        Buffer.from(dek.plaintext).fill(0)
      }
    },

    async get(tenantId, providerId, partitionKey) {
      const rows = await sql<
        Array<{
          kms_key_id: string
          wrapped_dek: Uint8Array
          iv: Uint8Array
          auth_tag: Uint8Array
          ciphertext: Uint8Array
          expires_at: Date
        }>
      >`
        SELECT kms_key_id, wrapped_dek, iv, auth_tag, ciphertext, expires_at
          FROM oauth.oauth_tokens
         WHERE tenant_id = ${tenantId}
           AND provider_id = ${providerId}
           AND partition_key = ${partitionKey}
         LIMIT 1
      `
      const r = rows[0]
      if (!r) return null
      const dekPlain = await kms.decrypt(r.wrapped_dek, r.kms_key_id)
      try {
        const decipher = createDecipheriv('aes-256-gcm', Buffer.from(dekPlain), Buffer.from(r.iv))
        decipher.setAuthTag(Buffer.from(r.auth_tag))
        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(r.ciphertext)),
          decipher.final(),
        ])
        const parsed = JSON.parse(plaintext.toString('utf8')) as {
          access: string
          refresh: string | null
          scopes: string[]
          expires: string
          meta: Record<string, unknown>
        }
        return {
          accessToken: parsed.access,
          refreshToken: parsed.refresh,
          scopes: parsed.scopes,
          expiresAt: new Date(parsed.expires),
          meta: parsed.meta,
        }
      } catch {
        throw new KmsAuthTagInvalid()
      } finally {
        Buffer.from(dekPlain).fill(0)
      }
    },

    async delete(tenantId, providerId, partitionKey) {
      await sql`
        DELETE FROM oauth.oauth_tokens
         WHERE tenant_id = ${tenantId}
           AND provider_id = ${providerId}
           AND partition_key = ${partitionKey}
      `
    },
  }
}
