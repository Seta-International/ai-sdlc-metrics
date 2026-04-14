import type { UserIdentity } from '../entities/user-identity.entity'

export const USER_IDENTITY_REPOSITORY = Symbol('IUserIdentityRepository')

export interface IUserIdentityRepository {
  findById(id: string, tenantId: string): Promise<UserIdentity | null>
  findBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null>
  insert(data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider: UserIdentity['provider']
  }): Promise<UserIdentity>
  findByEmail(email: string): Promise<UserIdentity | null>
  deprovisionByActorId(actorId: string, tenantId: string): Promise<void>
  updateLastLogin(id: string): Promise<void>
}
