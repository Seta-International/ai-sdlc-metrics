import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let listInsightsHandler: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dismissInsightHandler: any

export function setAgentInsightHandlers(handlers: { listInsights: any; dismissInsight: any }) {
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
