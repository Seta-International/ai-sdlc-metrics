import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ServiceUnavailable } from '@seta/middleware'
import type { Sql } from 'postgres'
import type { EncryptionContext, KmsClient } from './kms'

export type TokenBundle = {
  accessToken: string
  refreshToken: string | null
  scopes: string[]
  expiresAt: Date
  meta: Record<string, unknown>
}

export interface TokenVault {
  get(
    tenantId: string,
    providerId: string,
    partitionKey: string,
    executor?: Sql,
  ): Promise<TokenBundle | null>
  put(
    tenantId: string,
    providerId: string,
    partitionKey: string,
    bundle: TokenBundle,
    executor?: Sql,
  ): Promise<void>
  delete(tenantId: string, providerId: string, partitionKey: string, executor?: Sql): Promise<void>
}

export class KmsAuthTagInvalid extends ServiceUnavailable {
  constructor() {
    super('token decrypt failed — auth tag mismatch')
  }
}

/** Bind (tenantId, providerId, partitionKey, envelopeVersion) to the AES-GCM tag. */
function buildAad(tenantId: string, providerId: string, partitionKey: string): Buffer {
  return Buffer.from(`${tenantId}|${providerId}|${partitionKey}|v1`, 'utf8')
}

function buildEncryptionContext(
  tenantId: string,
  providerId: string,
  partitionKey: string,
): EncryptionContext {
  return { tenant_id: tenantId, provider_id: providerId, partition_key: partitionKey }
}

/**
 * Run `fn` inside a tx that has `app.tenant_id` set, so RLS policies on
 * tenant-data tables (e.g. oauth.oauth_tokens) match. When the caller already
 * supplies a tenant-scoped executor (e.g. from `withTenant` or `acquireToken`),
 * we just execute on it.
 */
function withTenantTx<T>(
  sql: Sql,
  tenantId: string,
  executor: Sql | undefined,
  fn: (x: Sql) => Promise<T>,
): Promise<T> {
  if (executor) return fn(executor)
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as Sql)
  }) as Promise<T>
}

export function createTokenVault(deps: { sql: Sql; kms: KmsClient }): TokenVault {
  const { sql, kms } = deps

  return {
    async put(tenantId, providerId, partitionKey, bundle, executor) {
      const ctx = buildEncryptionContext(tenantId, providerId, partitionKey)
      const aad = buildAad(tenantId, providerId, partitionKey)
      const dek = await kms.generateDataKey(ctx)
      // Track the JSON plaintext so we can wipe it after encryption.
      let plaintext: Buffer | null = null
      try {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', dek.plaintext, iv)
        cipher.setAAD(aad)
        plaintext = Buffer.from(
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

        await withTenantTx(
          sql,
          tenantId,
          executor,
          (x) => x`
          INSERT INTO oauth.oauth_tokens
            (tenant_id, provider_id, partition_key, scope_set, envelope_version,
             kms_key_id, wrapped_dek, iv, auth_tag, ciphertext, expires_at)
          VALUES
            (${tenantId}, ${providerId}, ${partitionKey}, ${x.json(bundle.scopes as never)}, 1,
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
        `,
        )
      } finally {
        // Zero the source DEK bytes directly. `Buffer.from(dek.plaintext)` would
        // allocate a copy and zero the copy, leaving the original in heap.
        dek.plaintext.fill(0)
        // Also wipe the serialized JSON bundle which held cleartext tokens.
        if (plaintext) plaintext.fill(0)
      }
    },

    async get(tenantId, providerId, partitionKey, executor) {
      const ctx = buildEncryptionContext(tenantId, providerId, partitionKey)
      const aad = buildAad(tenantId, providerId, partitionKey)
      const rows = await withTenantTx(
        sql,
        tenantId,
        executor,
        (x) =>
          x<
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
        `,
      )
      const r = rows[0]
      if (!r) return null
      const dekPlain = await kms.decrypt(r.wrapped_dek, r.kms_key_id, ctx)
      let plaintext: Buffer | null = null
      try {
        const decipher = createDecipheriv('aes-256-gcm', dekPlain, Buffer.from(r.iv))
        decipher.setAAD(aad)
        decipher.setAuthTag(Buffer.from(r.auth_tag))
        plaintext = Buffer.concat([decipher.update(Buffer.from(r.ciphertext)), decipher.final()])
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
        // Zero the source plaintext DEK bytes directly (not a copy).
        dekPlain.fill(0)
        if (plaintext) plaintext.fill(0)
      }
    },

    async delete(tenantId, providerId, partitionKey, executor) {
      await withTenantTx(
        sql,
        tenantId,
        executor,
        (x) => x`
        DELETE FROM oauth.oauth_tokens
         WHERE tenant_id = ${tenantId}
           AND provider_id = ${providerId}
           AND partition_key = ${partitionKey}
      `,
      )
    },
  }
}
