export type IdentityProvider = 'microsoft' | 'google' | 'local'
export type IdentityStatus = 'active' | 'suspended' | 'deprovisioned'

export interface UserIdentity {
  id: string
  tenantId: string
  actorId: string
  email: string
  ssoSubject: string
  provider: IdentityProvider
  status: IdentityStatus
  lastLoginAt: Date | null
  createdAt: Date
}
