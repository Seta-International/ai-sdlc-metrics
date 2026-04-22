import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import type { PreferencesQueryFacade } from '../../application/facades/preferences-query.facade'

const savedViewStateSchema = z.object({
  search: z.string(),
  filters: z.array(z.unknown()),
  sorting: z.array(
    z.object({
      field: z.string(),
      direction: z.enum(['asc', 'desc']),
    }),
  ),
  pagination: z.object({ pageSize: z.number() }),
  columnVisibility: z.record(z.string(), z.boolean()),
  columnPinning: z.object({
    left: z.array(z.string()).optional(),
    right: z.array(z.string()).optional(),
  }),
  density: z.enum(['compact', 'default', 'comfortable']),
})

export function createPreferencesRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionProtectedProcedure: any,
  preferencesFacade: PreferencesQueryFacade,
) {
  return router({
    savedView: router({
      list: permissionProtectedProcedure
        .input(z.object({ resourceKey: z.string() }))
        .query(async ({ ctx, input }: { ctx: AuthContext; input: { resourceKey: string } }) => {
          return preferencesFacade.list(ctx.tenantId, ctx.actorId, input.resourceKey)
        }),

      resolve: permissionProtectedProcedure
        .input(
          z.object({
            resourceKey: z.string(),
            activeViewId: z.string().uuid().nullable(),
          }),
        )
        .query(
          async ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: { resourceKey: string; activeViewId: string | null }
          }) => {
            return preferencesFacade.resolve(
              ctx.tenantId,
              ctx.actorId,
              input.resourceKey,
              input.activeViewId,
            )
          },
        ),

      create: permissionProtectedProcedure
        .input(
          z.object({
            resourceKey: z.string(),
            name: z.string().min(1),
            stateJson: savedViewStateSchema,
            isDefault: z.boolean().default(false),
          }),
        )
        .mutation(
          async ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: {
              resourceKey: string
              name: string
              stateJson: z.infer<typeof savedViewStateSchema>
              isDefault: boolean
            }
          }) => {
            return preferencesFacade.create({
              tenantId: ctx.tenantId,
              actorId: ctx.actorId,
              resourceKey: input.resourceKey,
              name: input.name,
              isDefault: input.isDefault,
              stateJson: input.stateJson,
            })
          },
        ),

      update: permissionProtectedProcedure
        .input(
          z.object({
            id: z.string().uuid(),
            name: z.string().min(1).optional(),
            stateJson: savedViewStateSchema.optional(),
          }),
        )
        .mutation(
          async ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: {
              id: string
              name?: string
              stateJson?: z.infer<typeof savedViewStateSchema>
            }
          }) => {
            const { id, ...data } = input
            try {
              return await preferencesFacade.update(id, ctx.tenantId, ctx.actorId, data)
            } catch {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `SavedView ${id} not found or not owned by current actor`,
              })
            }
          },
        ),

      delete: permissionProtectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }: { ctx: AuthContext; input: { id: string } }) => {
          await preferencesFacade.delete(input.id, ctx.tenantId, ctx.actorId)
        }),

      setDefault: permissionProtectedProcedure
        .input(
          z.object({
            id: z.string().uuid(),
            resourceKey: z.string(),
          }),
        )
        .mutation(
          async ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: { id: string; resourceKey: string }
          }) => {
            await preferencesFacade.setDefault(
              input.id,
              ctx.tenantId,
              ctx.actorId,
              input.resourceKey,
            )
          },
        ),
    }),
  })
}

// Default export for static type anchoring in app-router.ts.
// The TrpcModule.onModuleInit replaces this with a permission-checked,
// facade-bound instance via setPreferencesRouter(). Routes here are typed
// against publicProcedure purely so AppRouter type stays stable; runtime
// never hits these.
const _stubFacade = {
  list: async () => [],
  resolve: async () => ({ views: [], activeView: null, defaultViewId: null }),
  create: async () => {
    throw new Error('not initialized')
  },
  update: async () => {
    throw new Error('not initialized')
  },
  delete: async () => {
    throw new Error('not initialized')
  },
  setDefault: async () => {
    throw new Error('not initialized')
  },
} as unknown as PreferencesQueryFacade

export const preferencesRouter = createPreferencesRouter(publicProcedure, _stubFacade)
