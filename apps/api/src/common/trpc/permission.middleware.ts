import { TRPCError } from '@trpc/server'
import type { KernelQueryFacade } from '../../modules/kernel/application/facades/kernel-query.facade'
import type { IAuditLogger } from '../auth/audit-logger.interface'
import type { TrpcMeta } from './trpc-init'

export function createPermissionMiddleware(
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditLogger,
) {
  return async function permissionMiddleware(opts: {
    ctx: { actorId: string; tenantId: string }
    meta: TrpcMeta | undefined
    next: (opts: { ctx: { actorId: string; tenantId: string } }) => Promise<unknown>
    path: string
    type: string
    input: unknown
    rawInput: unknown
  }) {
    const { ctx, meta, next, path } = opts

    if (!meta?.permission) {
      return next({ ctx })
    }

    const allowed = await kernelFacade.canDo(ctx.actorId, meta.permission, {
      tenantId: ctx.tenantId,
    })

    if (!allowed) {
      await auditRepo.insert({
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        eventType: 'permission_denied',
        module: 'kernel',
        subjectId: ctx.actorId,
        payload: { permission: meta.permission, path, result: 'denied' },
      })
      throw new TRPCError({ code: 'FORBIDDEN', message: `Permission denied: ${meta.permission}` })
    }

    return next({ ctx })
  }
}
