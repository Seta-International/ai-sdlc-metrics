import type { Sql } from 'postgres'

export type IdTokenClaims = {
  tenantId: string
  providerId: string
  externalSubject: string
  email: string
  displayName?: string
  rawProfile?: Record<string, unknown>
}

export type CanonicalUser = {
  id: string
  tenantId: string
  email: string
  displayName?: string
  status: string
}

export interface JitMapper {
  upsertFromIdToken(claims: IdTokenClaims): Promise<CanonicalUser>
}

export function createJitMapper(sql: Sql): JitMapper {
  return {
    async upsertFromIdToken(claims) {
      return sql.begin(async (tx) => {
        const userRows = await tx<
          Array<{
            id: string
            tenant_id: string
            email: string
            display_name: string | null
            status: string
          }>
        >`
          INSERT INTO auth.users (tenant_id, external_provider, external_subject, email, display_name, status)
          VALUES (${claims.tenantId}, ${claims.providerId}, ${claims.externalSubject},
                  ${claims.email}, ${claims.displayName ?? null}, 'active')
          ON CONFLICT (external_provider, external_subject) DO UPDATE
            SET email        = excluded.email,
                display_name = excluded.display_name,
                updated_at   = now()
          RETURNING id, tenant_id, email, display_name, status
        `
        const u = userRows[0]
        if (!u) throw new Error('JIT mapper: upsert returned no row')

        await tx`
          INSERT INTO directory.external_identities (tenant_id, user_id, provider_id, external_subject, raw_profile, synced_at)
          VALUES (${claims.tenantId}, ${u.id}, ${claims.providerId}, ${claims.externalSubject},
                  ${tx.json((claims.rawProfile ?? {}) as never)}, now())
          ON CONFLICT (provider_id, external_subject) DO UPDATE
            SET raw_profile = excluded.raw_profile,
                synced_at   = excluded.synced_at
        `

        return {
          id: u.id,
          tenantId: u.tenant_id,
          email: u.email,
          ...(u.display_name !== null ? { displayName: u.display_name } : {}),
          status: u.status,
        }
      }) as Promise<CanonicalUser>
    },
  }
}
