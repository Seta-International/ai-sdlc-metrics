import type {
  OAuthAuthorizationSessionEntity,
  OAuthProviderType,
} from '../entities/oauth-authorization-session.entity'

export const OAUTH_AUTHORIZATION_SESSION_REPOSITORY = Symbol('IOAuthAuthorizationSessionRepository')

export interface IOAuthAuthorizationSessionRepository {
  insert(data: {
    tenantId: string
    providerId: string
    providerType: OAuthProviderType
    stateHash: string
    nonceHash: string
    redirectTo: string
    expiresAt: Date
  }): Promise<OAuthAuthorizationSessionEntity>
  /** Returns the session only if it is not expired and not consumed */
  findByStateHash(stateHash: string): Promise<OAuthAuthorizationSessionEntity | null>
  findByTenantId(tenantId: string): Promise<OAuthAuthorizationSessionEntity[]>
  consume(id: string, tenantId: string): Promise<void>
}
