import { describe, expect, test, vi } from 'vitest'
import { _resetEncoderCacheForTests, ENCODING_FOR_MODEL, getEncoder } from './encoder-cache'
import type { ChunkingError } from './errors'

describe('ENCODING_FOR_MODEL', () => {
  test('maps text-embedding-3-small to cl100k_base', () => {
    expect(ENCODING_FOR_MODEL['text-embedding-3-small']).toBe('cl100k_base')
  })

  test('maps gpt-5 to o200k_base (fallback per SCOPE Q4)', () => {
    expect(ENCODING_FOR_MODEL['gpt-5']).toBe('o200k_base')
  })
})

describe('getEncoder', () => {
  test('returns a usable Tiktoken instance for text-embedding-3-small', () => {
    const enc = getEncoder('text-embedding-3-small')
    const tokens = enc.encode('hello world')
    expect(tokens.length).toBeGreaterThan(0)
    expect(typeof tokens[0]).toBe('number')
  })

  test('returns a usable Tiktoken instance for gpt-5', () => {
    const enc = getEncoder('gpt-5')
    const tokens = enc.encode('hello world')
    expect(tokens.length).toBeGreaterThan(0)
  })

  test('memoizes — returns the same instance on repeated calls', () => {
    const a = getEncoder('text-embedding-3-small')
    const b = getEncoder('text-embedding-3-small')
    expect(a).toBe(b)
  })

  test('keeps caches per model separate', () => {
    const a = getEncoder('text-embedding-3-small')
    const b = getEncoder('gpt-5')
    expect(a).not.toBe(b)
  })
})

describe('getEncoder error path', () => {
  test('throws ChunkingError when js-tiktoken.getEncoding throws', async () => {
    vi.resetModules()
    // `@seta/agent-core` calls js-tiktoken.getEncoding eagerly at module load,
    // so let the first call through and only throw for callers that arrive
    // after agent-core's init has settled (i.e. encoder-cache).
    vi.doMock('js-tiktoken', async () => {
      const actual = await vi.importActual<typeof import('js-tiktoken')>('js-tiktoken')
      let calls = 0
      return {
        ...actual,
        getEncoding: (enc: Parameters<typeof actual.getEncoding>[0]) => {
          calls += 1
          if (calls === 1) return actual.getEncoding(enc)
          throw new Error('simulated load failure')
        },
      }
    })
    const mod = await import('./encoder-cache')
    const { ChunkingError: FreshChunkingError } = await import('./errors')
    mod._resetEncoderCacheForTests()

    expect(() => mod.getEncoder('text-embedding-3-small')).toThrow(FreshChunkingError)

    try {
      mod.getEncoder('text-embedding-3-small')
    } catch (e) {
      expect(e).toBeInstanceOf(FreshChunkingError)
      const ce = e as ChunkingError
      expect(ce.code).toBe('ENCODER_LOAD_FAILED')
      expect(ce.category).toBe('SYSTEM')
      expect((ce.cause as Error).message).toBe('simulated load failure')
    }

    vi.doUnmock('js-tiktoken')
    vi.resetModules()
    _resetEncoderCacheForTests()
  })
})
