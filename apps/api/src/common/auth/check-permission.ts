import { TRPCError } from '@trpc/server'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditEventRepository } from '../../modules/kernel/domain/repositories/audit-event.repository.port'

export interface CheckPermissionParams {
  actorId: string
  tenantId: string
  permission: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
}

/**
 * Handler-level permission check for resource-scoped operations.
 * Use when scope depends on the resource being acted on (e.g., employee's department).
 * Throws TRPCError FORBIDDEN if denied. Writes audit_event on denial.
 */
export async function checkPermission(
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditEventRepository,
  params: CheckPermissionParams,
): Promise<void> {
  const { actorId, tenantId, permission, scopeType, scopeId, resourceOwnerId } = params

  const context: {
    tenantId: string
    scopeType?: 'global' | 'department' | 'project' | 'account'
    scopeId?: string
    resourceOwnerId?: string
  } = { tenantId }

  if (scopeType !== undefined) context.scopeType = scopeType
  if (scopeId !== undefined) context.scopeId = scopeId
  if (resourceOwnerId !== undefined) context.resourceOwnerId = resourceOwnerId

  const allowed = await kernelFacade.canDo(actorId, permission, context)

  if (!allowed) {
    await auditRepo.insert({
      tenantId,
      actorId,
      eventType: 'permission_denied',
      module: 'kernel',
      subjectId: actorId,
      payload: {
        permission,
        ...(scopeType !== undefined && { scopeType }),
        ...(scopeId !== undefined && { scopeId }),
        result: 'denied',
      },
    })
    throw new TRPCError({ code: 'FORBIDDEN', message: `Permission denied: ${permission}` })
  }
}
