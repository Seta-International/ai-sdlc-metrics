import * as z from 'zod'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import { ListSuggestionsHandler } from '../../application/queries/list-suggestions.handler'
import { ListSuggestionsQuery } from '../../application/queries/list-suggestions.query'

let listSuggestionsHandler: ListSuggestionsHandler | undefined

export function setListSuggestionsHandler(handler: ListSuggestionsHandler): void {
  listSuggestionsHandler = handler
}

function getHandler(): ListSuggestionsHandler {
  if (!listSuggestionsHandler) {
    throw new Error('listSuggestionsHandler not wired - boot failure')
  }

  return listSuggestionsHandler
}

export const suggestionsRouter = router({
  list: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_READ })
    .input(
      z.object({
        surface: z.string().min(1).max(64),
        contextEntity: z.string().max(200).optional(),
        contextEntityId: z.string().max(64).optional(),
      }),
    )
    .query(({ input }) =>
      getHandler().execute(new ListSuggestionsQuery(input.surface, input.contextEntity)),
    ),
})
