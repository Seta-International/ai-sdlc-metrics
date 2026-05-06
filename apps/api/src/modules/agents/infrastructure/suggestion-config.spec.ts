import { describe, it, expect } from 'vitest'
import { resolveSuggestions, KNOWN_SURFACES } from './suggestion-config'

describe('suggestion-config', () => {
  it('returns 4 suggestions for each known surface', () => {
    for (const surface of KNOWN_SURFACES) {
      const result = resolveSuggestions({ surface })

      expect(result.suggestions).toHaveLength(4)
      expect(result.welcomeSubtext).toBeTruthy()
    }
  })

  it('returns empty array + generic subtext for unknown surface', () => {
    const result = resolveSuggestions({ surface: 'unknown_surface' })

    expect(result.suggestions).toEqual([])
    expect(result.welcomeSubtext).toBeTruthy()
  })

  it('templates {entity} into suggestions when contextEntity is provided', () => {
    const result = resolveSuggestions({ surface: 'planner', contextEntity: 'Q1 Launch' })

    expect(result.suggestions.some((suggestion) => suggestion.text.includes('Q1 Launch'))).toBe(
      true,
    )
  })

  it('preserves slug stability for templated suggestions', () => {
    const withoutEntity = resolveSuggestions({ surface: 'planner' })
    const withEntity = resolveSuggestions({ surface: 'planner', contextEntity: 'Q1' })

    expect(withoutEntity.suggestions.map((suggestion) => suggestion.slug)).toEqual(
      withEntity.suggestions.map((suggestion) => suggestion.slug),
    )
  })
})
