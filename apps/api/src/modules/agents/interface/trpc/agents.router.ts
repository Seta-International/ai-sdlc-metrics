import { router } from '../../../../common/trpc/trpc-init'
import { sessionRouter } from './session.router'
import { insightRouter } from './insight.router'
import { preferencesRouter } from './preferences.router'
import { conversationRouter } from './conversation.router'
import { draftAuditRouter } from './draft-audit.router'
import { draftApprovalRouter } from './draft-approval.router'
import { scheduleUiRouter } from './schedule-ui-facade'
import { rolloutRouter } from './rollout.router'
import { readinessRouter } from './readiness.router'
import { kbRouter } from './kb.router'

export const agentsRouter = router({
  session: sessionRouter,
  insight: insightRouter,
  preferences: preferencesRouter,
  conversation: conversationRouter,
  drafts: draftAuditRouter,
  draftApproval: draftApprovalRouter,
  schedule: scheduleUiRouter,
  rollout: rolloutRouter,
  readiness: readinessRouter,
  kb: kbRouter,
})
