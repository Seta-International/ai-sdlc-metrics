import { describe, expect, test } from 'vitest'
import { ChunkingError } from './errors'
import {
  ChunkOptionsSchema,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  parseChunkOptions,
} from './options'

describe('default constants', () => {
  test('exposes recommended defaults', () => {
    expect(DEFAULT_MAX_TOKENS).toBe(512)
    expect(DEFAULT_OVERLAP_TOKENS).toBe(64)
  })
})

describe('ChunkOptionsSchema', () => {
  test('accepts valid options for text-embedding-3-small', () => {
    const r = ChunkOptionsSchema.safeParse({
      maxTokens: 512,
      overlapTokens: 64,
      model: 'text-embedding-3-small',
    })
    expect(r.success).toBe(true)
  })

  test('accepts valid options for gpt-5', () => {
    const r = ChunkOptionsSchema.safeParse({
      maxTokens: 1024,
      overlapTokens: 0,
      model: 'gpt-5',
    })
    expect(r.success).toBe(true)
  })

  test('rejects unknown model', () => {
    const r = ChunkOptionsSchema.safeParse({
      maxTokens: 512,
      overlapTokens: 64,
      model: 'claude-opus-4-7',
    })
    expect(r.success).toBe(false)
  })

  test('rejects non-integer maxTokens', () => {
    const r = ChunkOptionsSchema.safeParse({
      maxTokens: 512.5,
      overlapTokens: 64,
      model: 'text-embedding-3-small',
    })
    expect(r.success).toBe(false)
  })

  test('rejects zero or negative maxTokens', () => {
    const r1 = ChunkOptionsSchema.safeParse({
      maxTokens: 0,
      overlapTokens: 0,
      model: 'text-embedding-3-small',
    })
    expect(r1.success).toBe(false)
    const r2 = ChunkOptionsSchema.safeParse({
      maxTokens: -1,
      overlapTokens: 0,
      model: 'text-embedding-3-small',
    })
    expect(r2.success).toBe(false)
  })

  test('rejects negative overlapTokens', () => {
    const r = ChunkOptionsSchema.safeParse({
      maxTokens: 512,
      overlapTokens: -1,
      model: 'text-embedding-3-small',
    })
    expect(r.success).toBe(false)
  })

  test('rejects overlapTokens >= maxTokens', () => {
    const r1 = ChunkOptionsSchema.safeParse({
      maxTokens: 512,
      overlapTokens: 512,
      model: 'text-embedding-3-small',
    })
    expect(r1.success).toBe(false)
    const r2 = ChunkOptionsSchema.safeParse({
      maxTokens: 100,
      overlapTokens: 200,
      model: 'text-embedding-3-small',
    })
    expect(r2.success).toBe(false)
  })
})

describe('parseChunkOptions', () => {
  test('returns parsed options on success', () => {
    const opts = parseChunkOptions({
      maxTokens: 512,
      overlapTokens: 64,
      model: 'text-embedding-3-small',
    })
    expect(opts.maxTokens).toBe(512)
    expect(opts.overlapTokens).toBe(64)
    expect(opts.model).toBe('text-embedding-3-small')
  })

  test('throws ChunkingError with USER category on invalid options', () => {
    expect(() =>
      parseChunkOptions({
        maxTokens: 100,
        overlapTokens: 200,
        model: 'text-embedding-3-small',
      }),
    ).toThrow(ChunkingError)

    try {
      parseChunkOptions({
        maxTokens: 100,
        overlapTokens: 200,
        model: 'text-embedding-3-small',
      })
    } catch (e) {
      expect(e).toBeInstanceOf(ChunkingError)
      const ce = e as ChunkingError
      expect(ce.code).toBe('INVALID_OPTIONS')
      expect(ce.category).toBe('USER')
      expect(ce.cause).toBeDefined()
    }
  })
})
