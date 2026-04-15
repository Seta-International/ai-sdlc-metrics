import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { ListInsightsHandler } from '../../application/queries/list-insights.handler'
import type { DismissInsightHandler } from '../../application/commands/dismiss-insight.handler'

let listInsightsHandler: ListInsightsHandler
let dismissInsightHandler: DismissInsightHandler

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
      const { ListInsightsQuery } = require('../../application/queries/list-insights.query')
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
      const {
        DismissInsightCommand,
      } = require('../../application/commands/dismiss-insight.command')
      return dismissInsightHandler.execute(
        new DismissInsightCommand(input.tenantId, input.insightId),
      )
    }),
})
