import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import type { L3PreferenceService } from '../../application/services/l3-preferences'

let preferencesService: L3PreferenceService | undefined

export function setPreferencesService(svc: L3PreferenceService): void {
  preferencesService = svc
}

function svc(): L3PreferenceService {
  if (!preferencesService) throw new Error('preferencesService not wired — boot failure')
  return preferencesService
}

export const preferencesRouter = router({
  set: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_PREFERENCE_WRITE })
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(({ input, ctx }) => {
      return svc().set({
        tenantId: ctx.tenantId ?? '',
        userId: ctx.actorId ?? '',
        key: input.key,
        value: input.value,
        updatedBy: ctx.actorId ?? '',
      })
    }),

  get: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_PREFERENCE_READ })
    .input(z.object({ key: z.string() }))
    .query(({ input, ctx }) => {
      return svc().get({
        tenantId: ctx.tenantId ?? '',
        userId: ctx.actorId ?? '',
        key: input.key,
      })
    }),

  getAll: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_PREFERENCE_READ })
    .query(({ ctx }) => {
      return svc().getAll({
        tenantId: ctx.tenantId ?? '',
        userId: ctx.actorId ?? '',
      })
    }),

  delete: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_PREFERENCE_WRITE })
    .input(z.object({ key: z.string().optional() }))
    .mutation(({ input, ctx }) => {
      const opts: { tenantId: string; userId: string; key?: string } = {
        tenantId: ctx.tenantId ?? '',
        userId: ctx.actorId ?? '',
      }
      if (input.key !== undefined) {
        opts.key = input.key
      }
      return svc().delete(opts)
    }),
})
