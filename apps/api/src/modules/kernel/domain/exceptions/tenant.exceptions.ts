import { DomainException } from './domain.exception'

export class TenantNotFoundException extends DomainException {
  readonly code = 'TENANT_NOT_FOUND'

  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`)
  }
}
