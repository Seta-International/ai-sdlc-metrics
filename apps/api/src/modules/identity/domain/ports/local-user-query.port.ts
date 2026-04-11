export const LOCAL_USER_QUERY_PORT = Symbol('ILocalUserQueryPort')

export interface LocalUserDto {
  actorId: string
  email: string
  displayName: string
  status: 'active' | 'suspended' | 'deprovisioned'
  lastLoginAt: Date | null
  createdAt: Date
}

export interface ILocalUserQueryPort {
  listByTenantId(tenantId: string): Promise<LocalUserDto[]>
}
