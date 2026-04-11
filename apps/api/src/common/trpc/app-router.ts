import { router } from './trpc-init'
import { kernelRouter } from '../../modules/kernel/interface/trpc/kernel.router'
import { identityRouter } from '../../modules/kernel/interface/trpc/identity.router'
import { peopleRouter } from '../../modules/people/interface/trpc/people.router'
import { timeRouter } from '../../modules/time/interface/trpc/time.router'
import { hiringRouter } from '../../modules/hiring/interface/trpc/hiring.router'
import { performanceRouter } from '../../modules/performance/interface/trpc/performance.router'
import { projectsRouter } from '../../modules/projects/interface/trpc/projects.router'
import { financeRouter } from '../../modules/finance/interface/trpc/finance.router'
import { goalsRouter } from '../../modules/goals/interface/trpc/goals.router'
import { insightsRouter } from '../../modules/insights/interface/trpc/insights.router'
import { agentsRouter } from '../../modules/agents/interface/trpc/agents.router'
import { plannerRouter } from '../../modules/planner/interface/trpc/planner.router'
import { adminRouter } from '../../modules/admin/interface/trpc/admin.router'

export const appRouter = router({
  identity: identityRouter,
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
