import { router } from './trpc-init'
// Re-export types that appear in AppRouter's inferred type so api-client can name them
export type { TrpcContext, TrpcMeta } from './trpc-init'
export type { ResolveLoginResult } from '../../modules/kernel/application/commands/resolve-login.command'
import { kernelRouter as defaultKernelRouter } from '../../modules/kernel/interface/trpc/kernel.router'
import { identityRouter } from '../../modules/kernel/interface/trpc/identity.router'
import { peopleRouter as defaultPeopleRouter } from '../../modules/people/interface/trpc/people.router'
import { timeRouter } from '../../modules/time/interface/trpc/time.router'
import { hiringRouter } from '../../modules/hiring/interface/trpc/hiring.router'
import { performanceRouter } from '../../modules/performance/interface/trpc/performance.router'
import { projectsRouter } from '../../modules/projects/interface/trpc/projects.router'
import { financeRouter } from '../../modules/finance/interface/trpc/finance.router'
import { goalsRouter } from '../../modules/goals/interface/trpc/goals.router'
import { insightsRouter } from '../../modules/insights/interface/trpc/insights.router'
import { agentsRouter } from '../../modules/agents/interface/trpc/agents.router'
import { plannerRouter } from '../../modules/planner/interface/trpc/planner.router'
import { adminRouter as defaultAdminRouter } from '../../modules/admin/interface/trpc/admin.router'
import { identityAdminRouter as defaultIdentityAdminRouter } from '../../modules/identity/interface/trpc/identity.router'

// Mutable references replaced by TrpcModule.onModuleInit with permission-enforcing versions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _kernelRouter: any = defaultKernelRouter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _peopleRouter: any = defaultPeopleRouter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _identityAdminRouter: any = defaultIdentityAdminRouter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminRouter: any = defaultAdminRouter

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setKernelRouter(r: any): void {
  _kernelRouter = r
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setPeopleRouter(r: any): void {
  _peopleRouter = r
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setIdentityAdminRouter(r: any): void {
  _identityAdminRouter = r
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setAdminRouter(r: any): void {
  _adminRouter = r
}

function buildAppRouter() {
  // Merge auth procedures from identityRouter with the admin sub-router.
  const identityWithAdmin = router({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(identityRouter._def.procedures as any),
    admin: _identityAdminRouter,
  })

  return router({
    kernel: _kernelRouter,
    identity: identityWithAdmin,
    people: _peopleRouter,
    time: timeRouter,
    hiring: hiringRouter,
    performance: performanceRouter,
    projects: projectsRouter,
    finance: financeRouter,
    goals: goalsRouter,
    insights: insightsRouter,
    agents: agentsRouter,
    planner: plannerRouter,
    admin: _adminRouter,
  })
}

// Static type anchor — derived from default routers so AppRouter type is always stable
export const appRouter = buildAppRouter()
export type AppRouter = typeof appRouter

let _initializedAppRouter: ReturnType<typeof buildAppRouter> | null = null

export function initAppRouter(): void {
  _initializedAppRouter = buildAppRouter()
}

export function getAppRouter(): ReturnType<typeof buildAppRouter> {
  if (!_initializedAppRouter) {
    throw new Error('appRouter not initialized. Call initAppRouter() from TrpcModule.onModuleInit.')
  }
  return _initializedAppRouter
}
