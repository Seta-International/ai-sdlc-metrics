import type { AuditActor } from '@seta/audit'
import { tenantContext } from '@seta/tenancy'

export function actorFromContext(): AuditActor {
  tenantContext.getTenantId()
  const userId = tenantContext.getUserId()
  return userId ? { type: 'user', userId } : { type: 'system', label: 'agent-memory' }
}
