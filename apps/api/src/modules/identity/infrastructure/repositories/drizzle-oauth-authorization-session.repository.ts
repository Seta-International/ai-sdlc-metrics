import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { OAuthAuthorizationSessionEntity } from '../../domain/entities/oauth-authorization-session.entity'
import type { IdpProviderType } from '../../domain/entities/identity-provider.entity'
import type { IOAuthAuthorizationSessionRepository } from '../../domain/repositories/oauth-authorization-session.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { oauthAuthorizationSession } from '../schema/index'

type OAuthSessionRow = typeof oauthAuthorizationSession.$inferSelect

function toEntity(row: OAuthSessionRow): OAuthAuthorizationSessionEntity {
  return OAuthAuthorizationSessionEntity.reconstruct({
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    providerType: row.providerType as IdpProviderType,
    stateHash: row.stateHash,
    nonceHash: row.nonceHash,
    callbackUri: row.callbackUri,
    redirectTo: row.redirectTo,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? null,
    createdAt: row.createdAt,
  })
}

@Injectable()
export class DrizzleOAuthAuthorizationSessionRepository implements IOAuthAuthorizationSessionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: {
    tenantId: string
    providerId: string
    providerType: IdpProviderType
    stateHash: string
    nonceHash: string
    callbackUri: string
    redirectTo: string
    expiresAt: Date
  }): Promise<OAuthAuthorizationSessionEntity> {
    const rows = await this.db
      .insert(oauthAuthorizationSession)
      .values({
        tenantId: data.tenantId,
        providerId: data.providerId,
        providerType: data.providerType,
        stateHash: data.stateHash,
        nonceHash: data.nonceHash,
        callbackUri: data.callbackUri,
        redirectTo: data.redirectTo,
        expiresAt: data.expiresAt,
      })
      .returning()
    return toEntity(rows[0] as OAuthSessionRow)
  }

  async findByStateHash(stateHash: string): Promise<OAuthAuthorizationSessionEntity | null> {
    const rows = await this.db
      .select()
      .from(oauthAuthorizationSession)
      .where(
        and(
          eq(oauthAuthorizationSession.stateHash, stateHash),
          isNull(oauthAuthorizationSession.consumedAt),
          gt(oauthAuthorizationSession.expiresAt, new Date()),
        ),
      )
      .limit(1)
    const row = rows[0] as OAuthSessionRow | undefined
    return row ? toEntity(row) : null
  }

  async findByTenantId(tenantId: string): Promise<OAuthAuthorizationSessionEntity[]> {
    const rows = await this.db
      .select()
      .from(oauthAuthorizationSession)
      .where(eq(oauthAuthorizationSession.tenantId, tenantId))
    return (rows as OAuthSessionRow[]).map(toEntity)
  }

  async consume(id: string, tenantId: string): Promise<boolean> {
    const rows = await this.db
      .update(oauthAuthorizationSession)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(oauthAuthorizationSession.id, id),
          eq(oauthAuthorizationSession.tenantId, tenantId),
          isNull(oauthAuthorizationSession.consumedAt),
        ),
      )
      .returning({ id: oauthAuthorizationSession.id })
    return rows.length > 0
  }
}
