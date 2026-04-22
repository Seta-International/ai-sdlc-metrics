import { router } from '../../../../common/trpc/trpc-init'
import { sessionRouter } from './session.router'
import { insightRouter } from './insight.router'
import { definitionRouter } from './definition.router'
import { preferencesRouter } from './preferences.router'
import { conversationRouter } from './conversation.router'

export const agentsRouter = router({
  session: sessionRouter,
  insight: insightRouter,
  definition: definitionRouter,
  preferences: preferencesRouter,
  conversation: conversationRouter,
})
