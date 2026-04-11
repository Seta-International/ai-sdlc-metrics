import type { UserIdentity } from '../entities/user-identity.entity'

export const USER_IDENTITY_REPOSITORY = Symbol('IUserIdentityRepository')

export interface IUserIdentityRepository {
  findById(id: string, tenantId: string): Promise<UserIdentity | null>
  findBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null>
  findByEmail(email: string, tenantId: string): Promise<UserIdentity | null>
  insert(data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider: UserIdentity['provider']
    status?: UserIdentity['status']
  }): Promise<UserIdentity>
  updateLastLogin(id: string): Promise<void>
  deprovisionByActorId(actorId: string, tenantId: string): Promise<void>
}
