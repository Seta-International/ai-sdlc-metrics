import { describe, expect, test } from 'vitest'
import * as api from './index'

describe('public surface', () => {
  test('exports the factory and constants', () => {
    expect(typeof api.createOpenAIEmbeddings).toBe('function')
    expect(api.EMBEDDING_MODEL).toBe('text-embedding-3-small')
    expect(api.EMBEDDING_DIMENSIONS).toBe(1536)
    expect(api.EMBEDDING_BATCH_SIZE).toBe(100)
    expect(api.EMBEDDING_MAX_INPUT_TOKENS).toBe(8191)
  })

  test('does not leak internals (parseInput / chunkBy / embed / makeEmbeddingsClient)', () => {
    expect((api as Record<string, unknown>).parseInput).toBeUndefined()
    expect((api as Record<string, unknown>).chunkBy).toBeUndefined()
    expect((api as Record<string, unknown>).embed).toBeUndefined()
    expect((api as Record<string, unknown>).makeEmbeddingsClient).toBeUndefined()
  })
})
