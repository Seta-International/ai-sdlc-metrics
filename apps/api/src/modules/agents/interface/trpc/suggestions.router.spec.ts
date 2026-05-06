import { beforeEach, describe, expect, it } from 'vitest'
import { suggestionsRouter, setListSuggestionsHandler } from './suggestions.router'
import { ListSuggestionsHandler } from '../../application/queries/list-suggestions.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const USER_ID = '01900000-0000-7000-8000-000000000002'

function makeCtx() {
  return {
    req: { headers: {} as Record<string, string | undefined> },
    tenantId: TENANT_ID,
    actorId: USER_ID,
  }
}

describe('suggestionsRouter', () => {
  beforeEach(() => {
    setListSuggestionsHandler(new ListSuggestionsHandler())
  })

  it('returns 4 suggestions for planner', async () => {
    const caller = suggestionsRouter.createCaller(makeCtx())
    const result = await caller.list({ surface: 'planner' })

    expect(result.suggestions).toHaveLength(4)
  })

  it('passes contextEntity through to templated suggestions', async () => {
    const caller = suggestionsRouter.createCaller(makeCtx())
    const result = await caller.list({ surface: 'planner', contextEntity: 'Q1 Launch' })

    expect(result.suggestions.some((suggestion) => suggestion.text.includes('Q1 Launch'))).toBe(
      true,
    )
  })

  it('procedures have no agent meta', () => {
    const def = suggestionsRouter._def

    for (const [name, proc] of Object.entries(def.procedures)) {
      const meta = (proc as { _def?: { meta?: { agent?: unknown } } })._def?.meta

      expect(meta?.agent, `${name} must not have agent meta`).toBeUndefined()
    }
  })
})
