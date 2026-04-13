import { TRPCError } from '@trpc/server'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../modules/kernel/application/facades/kernel-audit.facade'

export interface CheckPermissionParams {
  actorId: string
  tenantId: string
  permission: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string
}

export async function checkPermission(
  kernelFacade: KernelQueryFacade,
  auditFacade: KernelAuditFacade,
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
    await auditFacade.recordEvent({
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
