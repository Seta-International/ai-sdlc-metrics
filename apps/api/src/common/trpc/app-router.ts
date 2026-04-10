import { initTRPC } from '@trpc/server'

// TODO: add auth context (tenantId, actorId) from nestjs-cls
const t = initTRPC.create()

export const router = t.router
export const publicProcedure = t.procedure

// AppRouter is assembled here by merging all module routers.
// Each module contributes its router in Task 10.
export const appRouter = router({
  // Module routers are merged here as each module is scaffolded.
})

export type AppRouter = typeof appRouter
