/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { ListInsightsQuery } from '../../application/queries/list-insights.query'
import { DismissInsightCommand } from '../../application/commands/dismiss-insight.command'

let listInsightsHandler: any
let dismissInsightHandler: any

export function setAgentInsightHandlers(handlers: Record<string, any>) {
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
      return dismissInsightHandler.execute(
        new DismissInsightCommand(input.tenantId, input.insightId),
      )
    }),
})
