import { initTRPC } from '@trpc/server'
import { kernelRouter } from '../../modules/kernel/interface/trpc/kernel.router.js'
import { peopleRouter } from '../../modules/people/interface/trpc/people.router.js'
import { timeRouter } from '../../modules/time/interface/trpc/time.router.js'
import { hiringRouter } from '../../modules/hiring/interface/trpc/hiring.router.js'
import { performanceRouter } from '../../modules/performance/interface/trpc/performance.router.js'
import { projectsRouter } from '../../modules/projects/interface/trpc/projects.router.js'
import { financeRouter } from '../../modules/finance/interface/trpc/finance.router.js'
import { goalsRouter } from '../../modules/goals/interface/trpc/goals.router.js'
import { insightsRouter } from '../../modules/insights/interface/trpc/insights.router.js'
import { agentsRouter } from '../../modules/agents/interface/trpc/agents.router.js'
import { plannerRouter } from '../../modules/planner/interface/trpc/planner.router.js'
import { adminRouter } from '../../modules/admin/interface/trpc/admin.router.js'

const t = initTRPC.create()
export const router = t.router
export const publicProcedure = t.procedure

export const appRouter = router({
  kernel: kernelRouter,
  people: peopleRouter,
  time: timeRouter,
  hiring: hiringRouter,
  performance: performanceRouter,
  projects: projectsRouter,
  finance: financeRouter,
  goals: goalsRouter,
  insights: insightsRouter,
  agents: agentsRouter,
  planner: plannerRouter,
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
