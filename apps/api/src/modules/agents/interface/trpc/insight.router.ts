import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { ListInsightsQuery } from '../../application/queries/list-insights.query'
import { DismissInsightCommand } from '../../application/commands/dismiss-insight.command'
import type { ListInsightsHandler } from '../../application/queries/list-insights.handler'
import type { DismissInsightHandler } from '../../application/commands/dismiss-insight.handler'

let listInsightsHandler: ListInsightsHandler | undefined
let dismissInsightHandler: DismissInsightHandler | undefined

export function setAgentInsightHandlers(handlers: {
  listInsights: ListInsightsHandler
  dismissInsight: DismissInsightHandler
}) {
  listInsightsHandler = handlers.listInsights
  dismissInsightHandler = handlers.dismissInsight
}

export const insightRouter = router({
  list: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .query(({ input }) => {
      if (!listInsightsHandler) throw new Error('listInsightsHandler not wired — boot failure')
      return listInsightsHandler.execute(new ListInsightsQuery(input.actorId, input.tenantId))
    }),

  dismiss: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        insightId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) => {
      if (!dismissInsightHandler) throw new Error('dismissInsightHandler not wired — boot failure')
      return dismissInsightHandler.execute(
        new DismissInsightCommand(input.tenantId, input.insightId),
      )
    }),
})
