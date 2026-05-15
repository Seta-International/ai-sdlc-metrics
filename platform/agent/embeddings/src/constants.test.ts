import { describe, expect, test } from 'vitest'
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MAX_INPUT_TOKENS,
  EMBEDDING_MODEL,
} from './constants'

describe('public constants', () => {
  test('EMBEDDING_MODEL is text-embedding-3-small', () => {
    expect(EMBEDDING_MODEL).toBe('text-embedding-3-small')
  })

  test('EMBEDDING_DIMENSIONS is 1536', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536)
  })

  test('EMBEDDING_BATCH_SIZE is 100 (conservative batch pin)', () => {
    expect(EMBEDDING_BATCH_SIZE).toBe(100)
  })

  test('EMBEDDING_MAX_INPUT_TOKENS is 8191 (OpenAI limit)', () => {
    expect(EMBEDDING_MAX_INPUT_TOKENS).toBe(8191)
  })

  test('constants are typed as literals (compile-time check)', () => {
    // If these constants are widened to `string` / `number` instead of literal
    // types, this assignment becomes invalid in --strict mode. Compilation
    // failure surfaces here as a TS error.
    const m: 'text-embedding-3-small' = EMBEDDING_MODEL
    const d: 1536 = EMBEDDING_DIMENSIONS
    const b: 100 = EMBEDDING_BATCH_SIZE
    const t: 8191 = EMBEDDING_MAX_INPUT_TOKENS
    expect([m, d, b, t]).toEqual(['text-embedding-3-small', 1536, 100, 8191])
  })
})
