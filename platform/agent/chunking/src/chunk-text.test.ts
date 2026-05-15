import { describe, expect, test } from 'vitest'
import { chunkText } from './chunk-text'
import { ChunkingError } from './errors'
import type { ChunkOptions } from './options'

const SMALL: ChunkOptions = {
  maxTokens: 8,
  overlapTokens: 2,
  model: 'text-embedding-3-small',
}

describe('chunkText — edge cases', () => {
  test('empty input returns []', () => {
    expect(chunkText('', SMALL)).toEqual([])
  })

  test('input shorter than maxTokens returns single chunk spanning whole input', () => {
    const input = 'hi'
    const chunks = chunkText(input, SMALL)
    expect(chunks).toHaveLength(1)
    // biome-ignore lint/style/noNonNullAssertion: length verified above
    const c0 = chunks[0]!
    expect(c0.startChar).toBe(0)
    expect(c0.endChar).toBe(input.length)
    expect(c0.content).toBe(input)
    expect(c0.tokenCount).toBeGreaterThan(0)
    expect(c0.tokenCount).toBeLessThanOrEqual(SMALL.maxTokens)
  })

  test('long input produces multiple chunks each respecting maxTokens', () => {
    const input =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'
    const chunks = chunkText(input, SMALL)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(SMALL.maxTokens)
      expect(c.tokenCount).toBeGreaterThan(0)
      expect(c.content).toBe(input.slice(c.startChar, c.endChar))
    }
    // biome-ignore lint/style/noNonNullAssertion: length > 1 verified above
    expect(chunks[0]!.startChar).toBe(0)
    // biome-ignore lint/style/noNonNullAssertion: last index, length > 1 verified above
    expect(chunks[chunks.length - 1]!.endChar).toBe(input.length)
  })

  test('overlap = 0 produces non-overlapping chunks', () => {
    const opts: ChunkOptions = { maxTokens: 4, overlapTokens: 0, model: 'text-embedding-3-small' }
    const input = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi'
    const chunks = chunkText(input, opts)
    expect(chunks.length).toBeGreaterThan(1)
    // Adjacent chunks should not share content: c[i+1].startChar >= c[i].endChar
    for (let i = 1; i < chunks.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee valid indices
      expect(chunks[i]!.startChar).toBeGreaterThanOrEqual(chunks[i - 1]!.endChar)
    }
  })

  test('maxTokens = 1 produces one-token-wide chunks', () => {
    const opts: ChunkOptions = { maxTokens: 1, overlapTokens: 0, model: 'text-embedding-3-small' }
    const chunks = chunkText('hello world', opts)
    for (const c of chunks) {
      expect(c.tokenCount).toBe(1)
    }
  })

  test('throws ChunkingError on invalid options (overlapTokens >= maxTokens)', () => {
    expect(() =>
      chunkText('hello', {
        maxTokens: 100,
        overlapTokens: 200,
        model: 'text-embedding-3-small',
      }),
    ).toThrow(ChunkingError)
  })

  test('throws ChunkingError on unknown model', () => {
    expect(() =>
      chunkText('hello', {
        maxTokens: 100,
        overlapTokens: 0,
        model: 'claude-opus-4-7' as never,
      }),
    ).toThrow(ChunkingError)
  })

  test('content/offset roundtrip holds on CJK input', () => {
    const input = '今天天气真好,我们去公园散步吧。今天天气真好,我们去公园散步吧。'
    const chunks = chunkText(input, SMALL)
    for (const c of chunks) {
      expect(c.content).toBe(input.slice(c.startChar, c.endChar))
    }
  })

  test('determinism: same input + opts produce byte-identical chunks', () => {
    const input = 'deterministic chunking should produce the same output every time'
    const a = chunkText(input, SMALL)
    const b = chunkText(input, SMALL)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
