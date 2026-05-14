import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { __internal_chunkTextWithTrace, chunkText } from './chunk-text'
import type { ChunkOptions, SupportedModel } from './options'

const MODELS: readonly SupportedModel[] = ['text-embedding-3-small', 'gpt-5']

const optsArb = fc
  .tuple(
    fc.integer({ min: 1, max: 128 }),
    fc.integer({ min: 0, max: 127 }),
    fc.constantFrom(...MODELS),
  )
  .map(
    ([maxTokens, overlapRaw, model]): ChunkOptions => ({
      maxTokens,
      overlapTokens: Math.min(overlapRaw, maxTokens - 1),
      model,
    }),
  )

const inputArb = fc.string({ minLength: 1, maxLength: 800 })

describe('chunkText — property tests', () => {
  test('token-budget invariant: every chunk.tokenCount ≤ opts.maxTokens', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const chunks = chunkText(input, opts)
        for (const c of chunks) {
          expect(c.tokenCount).toBeLessThanOrEqual(opts.maxTokens)
        }
      }),
      { numRuns: 200 },
    )
  })

  test('content/offset roundtrip: chunk.content === input.slice(startChar, endChar)', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const chunks = chunkText(input, opts)
        for (const c of chunks) {
          expect(c.content).toBe(input.slice(c.startChar, c.endChar))
        }
      }),
      { numRuns: 200 },
    )
  })

  test('coverage: non-empty input ⇒ first.startChar = 0 and last.endChar = input.length', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const chunks = chunkText(input, opts)
        if (chunks.length === 0) return
        expect(chunks[0]!.startChar).toBe(0)
        expect(chunks[chunks.length - 1]!.endChar).toBe(input.length)
      }),
      { numRuns: 200 },
    )
  })

  test('stride correctness: consecutive chunks start `stride` tokens apart (except final)', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const trace = __internal_chunkTextWithTrace(input, opts)
        const stride = opts.maxTokens - opts.overlapTokens
        // Recover token index per chunk by finding charOfs entry that matches startChar.
        // charOfs is monotonically non-decreasing; map startChar back to token index.
        const tokenIdxFor = (startChar: number): number => trace.charOfs.indexOf(startChar)

        for (let n = 1; n < trace.chunks.length; n++) {
          // Skip the last pair if the previous chunk reached the end of tokens — final stride may be truncated.
          const prev = trace.chunks[n - 1]!
          const cur = trace.chunks[n]!
          const prevTokIdx = tokenIdxFor(prev.startChar)
          const curTokIdx = tokenIdxFor(cur.startChar)
          // Guard: only assert when both lookups succeeded.
          if (prevTokIdx < 0 || curTokIdx < 0) return
          // Skip when the previous chunk was the final one (no further chunks should exist;
          // but if we're here, n is not the final iteration of the while loop's "break").
          expect(curTokIdx - prevTokIdx).toBe(stride)
        }
      }),
      { numRuns: 200 },
    )
  })

  test('determinism: chunkText is a pure function', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const a = chunkText(input, opts)
        const b = chunkText(input, opts)
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      }),
      { numRuns: 100 },
    )
  })
})
