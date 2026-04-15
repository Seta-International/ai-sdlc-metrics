import { router } from '../../../../common/trpc/trpc-init'
import { sessionRouter } from './session.router'
import { insightRouter } from './insight.router'
import { definitionRouter } from './definition.router'

export const agentsRouter = router({
  session: sessionRouter,
  insight: insightRouter,
  definition: definitionRouter,
})
