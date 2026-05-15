import { describe, expect, test } from 'vitest'
import { createOpenAIEmbeddings, makeEmbeddingsClient } from './client'

describe('createOpenAIEmbeddings', () => {
  test('returns an EmbeddingsClient with an `embed` method', () => {
    const c = createOpenAIEmbeddings({ apiKey: 'sk-test' })
    expect(typeof c.embed).toBe('function')
  })

  test('accepts baseURL and timeoutMs overrides without throwing', () => {
    expect(() =>
      createOpenAIEmbeddings({
        apiKey: 'sk-test',
        baseURL: 'https://custom.example/v1',
        timeoutMs: 10_000,
      }),
    ).not.toThrow()
  })
})

describe('makeEmbeddingsClient', () => {
  test('accepts a minimal OpenAI-shaped client object', () => {
    const fake = {
      embeddings: { create: async () => ({ data: [], usage: {} }) },
    } as unknown as Parameters<typeof makeEmbeddingsClient>[0]
    const c = makeEmbeddingsClient(fake)
    expect(typeof c.embed).toBe('function')
  })
})
