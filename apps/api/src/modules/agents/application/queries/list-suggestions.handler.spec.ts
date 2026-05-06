import { describe, it, expect } from 'vitest'
import { ListSuggestionsQuery } from './list-suggestions.query'
import { ListSuggestionsHandler } from './list-suggestions.handler'

describe('ListSuggestionsHandler', () => {
  it('returns 4 suggestions for known surface', async () => {
    const handler = new ListSuggestionsHandler()

    const result = await handler.execute(new ListSuggestionsQuery('planner'))

    expect(result.suggestions).toHaveLength(4)
  })

  it('templates contextEntity into suggestions', async () => {
    const handler = new ListSuggestionsHandler()

    const result = await handler.execute(new ListSuggestionsQuery('planner', 'Q1 Launch'))

    expect(result.suggestions.some((suggestion) => suggestion.text.includes('Q1 Launch'))).toBe(
      true,
    )
  })

  it('returns empty list for unknown surface', async () => {
    const handler = new ListSuggestionsHandler()

    const result = await handler.execute(new ListSuggestionsQuery('unknown_zone_xyz'))

    expect(result.suggestions).toEqual([])
  })
})
