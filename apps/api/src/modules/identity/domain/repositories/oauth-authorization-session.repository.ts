import type { OAuthAuthorizationSessionEntity } from '../entities/oauth-authorization-session.entity'
import type { IdpProviderType } from '../entities/identity-provider.entity'

export const OAUTH_AUTHORIZATION_SESSION_REPOSITORY = Symbol('IOAuthAuthorizationSessionRepository')

export interface IOAuthAuthorizationSessionRepository {
  insert(data: {
    tenantId: string
    providerId: string
    providerType: IdpProviderType
    stateHash: string
    nonceHash: string
    callbackUri: string
    redirectTo: string
    expiresAt: Date
  }): Promise<OAuthAuthorizationSessionEntity>
  /**
   * Returns the session only if it is not expired and not consumed.
   * State is globally unique — this query is NOT tenant-scoped.
   * The caller MUST verify entity.tenantId matches the expected tenant before proceeding.
   */
  findByStateHash(stateHash: string): Promise<OAuthAuthorizationSessionEntity | null>
  findByTenantId(tenantId: string): Promise<OAuthAuthorizationSessionEntity[]>
  /**
   * Atomically marks the session as consumed.
   * Returns `true` if this call consumed the session (1 row updated),
   * `false` if it was already consumed (0 rows updated — race condition guard).
   */
  consume(id: string, tenantId: string): Promise<boolean>
}
