import { describe, expect, test } from 'vitest'
import { getEncoder } from './encoder-cache'
import { tokenStartChars } from './token-start-chars'

describe('tokenStartChars', () => {
  test('empty input → [0]', () => {
    const enc = getEncoder('text-embedding-3-small')
    const tokens: number[] = []
    const ofs = tokenStartChars(tokens, enc, '')
    expect(ofs).toEqual([0])
  })

  test('ASCII: each offset is a valid UTF-16 prefix length', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'The quick brown fox jumps over the lazy dog.'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs.length).toBe(tokens.length + 1)
    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
  })

  test('ASCII: offsets are monotonically non-decreasing', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'one two three four five six seven eight nine ten'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    for (let i = 1; i < ofs.length; i++) {
      expect(ofs[i]).toBeGreaterThanOrEqual(ofs[i - 1]!)
    }
  })

  test('ASCII: input.slice between consecutive offsets is non-empty for most boundaries', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'hello world this is a test of the tokenizer offset mapping'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    // For ASCII, every boundary advances at least one char (no zero-width tokens).
    for (let i = 1; i < ofs.length; i++) {
      expect(ofs[i]).toBeGreaterThan(ofs[i - 1]!)
    }
  })

  test('ASCII: concat of slices reproduces the input', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'concatenation reconstruction property test for ASCII inputs'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    let assembled = ''
    for (let i = 0; i < tokens.length; i++) {
      assembled += input.slice(ofs[i]!, ofs[i + 1]!)
    }
    expect(assembled).toBe(input)
  })

  test('CJK input: final offset equals input.length', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = '今天天气真好,我们去公园散步吧。'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
  })

  test('CJK input: concat of slices reproduces the input', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = '你好世界,这是一个测试。'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    let assembled = ''
    for (let i = 0; i < tokens.length; i++) {
      assembled += input.slice(ofs[i]!, ofs[i + 1]!)
    }
    expect(assembled).toBe(input)
  })

  test('mixed script: concat of slices reproduces the input', () => {
    const enc = getEncoder('gpt-5')
    const input = 'Hello 世界 hola mundo こんにちは'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    let assembled = ''
    for (let i = 0; i < tokens.length; i++) {
      assembled += input.slice(ofs[i]!, ofs[i + 1]!)
    }
    expect(assembled).toBe(input)
  })

  test('single emoji: produces valid offsets', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = '🌍'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
    expect(input.length).toBe(2) // surrogate pair → 2 UTF-16 units
  })

  test('whitespace-runs: final offset equals input.length', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'a   b\t\tc\n\n\nd'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
  })

  test('offsets length is exactly tokens.length + 1', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'arbitrary text of moderate length for the assertion'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs).toHaveLength(tokens.length + 1)
  })
})
