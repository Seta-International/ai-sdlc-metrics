import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router } from '../../../../common/trpc/trpc-init'
import { devProtectedProcedure } from '../../../../common/trpc/procedures'
import type { ISavedViewRepository } from '../../domain/repositories/saved-view.repository'

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

export function createPreferencesRouter(savedViewRepo: ISavedViewRepository) {
  return router({
    savedView: router({
      list: devProtectedProcedure
        .input(z.object({ resourceKey: z.string() }))
        .query(async ({ ctx, input }) => {
          return savedViewRepo.listByResource(ctx.tenantId, ctx.actorId, input.resourceKey)
        }),

      resolve: devProtectedProcedure
        .input(
          z.object({
            resourceKey: z.string(),
            activeViewId: z.string().uuid().nullable(),
          }),
        )
        .query(async ({ ctx, input }) => {
          return savedViewRepo.resolve(
            ctx.tenantId,
            ctx.actorId,
            input.resourceKey,
            input.activeViewId,
          )
        }),

      create: devProtectedProcedure
        .input(
          z.object({
            resourceKey: z.string(),
            name: z.string().min(1),
            stateJson: savedViewStateSchema,
            isDefault: z.boolean().default(false),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          return savedViewRepo.create({
            tenantId: ctx.tenantId,
            actorId: ctx.actorId,
            resourceKey: input.resourceKey,
            name: input.name,
            isDefault: input.isDefault,
            stateJson: input.stateJson,
          })
        }),

      update: devProtectedProcedure
        .input(
          z.object({
            id: z.string().uuid(),
            name: z.string().min(1).optional(),
            stateJson: savedViewStateSchema.optional(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          const { id, ...data } = input
          try {
            return await savedViewRepo.update(id, ctx.tenantId, ctx.actorId, data)
          } catch {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `SavedView ${id} not found or not owned by current actor`,
            })
          }
        }),

      delete: devProtectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
          await savedViewRepo.delete(input.id, ctx.tenantId, ctx.actorId)
        }),

      setDefault: devProtectedProcedure
        .input(
          z.object({
            id: z.string().uuid(),
            resourceKey: z.string(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          await savedViewRepo.setDefault(input.id, ctx.tenantId, ctx.actorId, input.resourceKey)
        }),
    }),
  })
}

// Default export for static type anchoring in app-router.ts
// Instantiated with a no-op stub; real instance injected via setPreferencesRouter()
const _stubRepo: ISavedViewRepository = {
  listByResource: async () => [],
  findById: async () => null,
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
}

export const preferencesRouter = createPreferencesRouter(_stubRepo)
