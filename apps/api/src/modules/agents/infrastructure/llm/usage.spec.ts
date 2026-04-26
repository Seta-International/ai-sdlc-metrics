/**
 * usage.spec.ts — covers the shared `mapLanguageModelUsage` helper used by
 * both LLM clients (sub-agent + synthesizer) to project the AI SDK's
 * `LanguageModelUsage` into our `SubAgentUsage` shape.
 *
 * The earlier private copies in each client hard-coded cache + reasoning
 * fields to 0; these tests pin the corrected behaviour so future SDK upgrades
 * cannot silently regress.
 */

import { describe, it, expect } from 'vitest'
import { mapLanguageModelUsage } from './usage'

describe('mapLanguageModelUsage', () => {
  it('maps the full input set into all six SubAgentUsage fields', () => {
    const result = mapLanguageModelUsage({
      inputTokens: 100,
      outputTokens: 200,
      inputTokenDetails: { cacheReadTokens: 30, cacheWriteTokens: 10 },
      outputTokenDetails: { reasoningTokens: 50 },
    })

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 200,
      inputCachedRead: 30,
      inputCachedWrite: 10,
      outputReasoning: 50,
      costUsd: 0,
    })
  })

  it('defaults cache + reasoning fields to 0 when details are missing', () => {
    const result = mapLanguageModelUsage({ inputTokens: 5, outputTokens: 10 })

    expect(result).toEqual({
      inputTokens: 5,
      outputTokens: 10,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0,
    })
  })

  it('returns all zero values when input is empty', () => {
    const result = mapLanguageModelUsage({})

    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0,
    })
  })

  it('defaults individual missing detail fields independently', () => {
    const result = mapLanguageModelUsage({
      inputTokens: 1,
      outputTokens: 2,
      inputTokenDetails: { cacheReadTokens: 7 }, // cacheWriteTokens missing
      outputTokenDetails: {}, // reasoningTokens missing
    })

    expect(result.inputCachedRead).toBe(7)
    expect(result.inputCachedWrite).toBe(0)
    expect(result.outputReasoning).toBe(0)
  })
})
