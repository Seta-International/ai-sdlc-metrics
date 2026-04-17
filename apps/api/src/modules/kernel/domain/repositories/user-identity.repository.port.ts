import type { UserIdentity } from '../entities/user-identity.entity'

export const USER_IDENTITY_REPOSITORY = Symbol('IUserIdentityRepository')

export interface IUserIdentityRepository {
  findById(id: string, tenantId: string): Promise<UserIdentity | null>
  findBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null>
  findByEmailAndTenant(email: string, tenantId: string): Promise<UserIdentity | null>
  insert(data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider: UserIdentity['provider']
  }): Promise<UserIdentity>
  /**
   * Bind a placeholder identity (sso_subject like `pending-sso-…`) to a real
   * SSO subject on first login. Use only when the existing row's sso_subject
   * was a provisioning placeholder.
   */
  claimSsoSubject(
    id: string,
    tenantId: string,
    ssoSubject: string,
    provider: UserIdentity['provider'],
  ): Promise<void>
  findByEmail(email: string): Promise<UserIdentity | null>
  deprovisionByActorId(actorId: string, tenantId: string): Promise<void>
  updateLastLogin(id: string): Promise<void>
}

/**
 * Sso_subject prefix used by provision scripts to denote a pre-provisioned
 * identity that hasn't been claimed by a real SSO login yet. The auto-claim
 * flow in resolveLogin upgrades these to the real `claims.oid` on first login.
 */
export const PLACEHOLDER_SSO_SUBJECT_PREFIX = 'pending-sso-'
