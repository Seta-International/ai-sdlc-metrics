import { LlmError } from '@seta/agent-core'
import { describe, expect, test } from 'vitest'
import { parseInput } from './parse-input'

describe('parseInput — accepts valid input', () => {
  test('accepts an array of non-blank strings', () => {
    expect(() => parseInput(['hello', 'world'])).not.toThrow()
  })

  test('accepts a single-element array', () => {
    expect(() => parseInput(['just one'])).not.toThrow()
  })

  test('accepts strings containing whitespace (so long as there is at least one non-whitespace char)', () => {
    expect(() => parseInput(['  hello  ', 'a b c'])).not.toThrow()
  })

  test('asserts the type — the post-call type is string[]', () => {
    const raw: unknown = ['hi']
    parseInput(raw)
    // After parseInput, `raw` is typed as string[]. The next line compiles
    // only because of the `asserts texts is string[]` signature.
    const upper: string[] = raw.map((t) => t.toUpperCase())
    expect(upper).toEqual(['HI'])
  })
})

describe('parseInput — rejects invalid input', () => {
  test('rejects non-array input (object) with LlmError(LLM_BAD_REQUEST, USER)', () => {
    try {
      parseInput({ not: 'an array' })
      throw new Error('expected parseInput to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(LlmError)
      const le = e as LlmError
      expect(le.code).toBe('LLM_BAD_REQUEST')
      expect(le.category).toBe('USER')
      expect(le.domain).toBe('LLM')
    }
  })

  test('rejects non-array input (string) with LlmError(LLM_BAD_REQUEST, USER)', () => {
    expect(() => parseInput('hello')).toThrow(LlmError)
  })

  test('rejects non-array input (null) with LlmError(LLM_BAD_REQUEST, USER)', () => {
    expect(() => parseInput(null)).toThrow(LlmError)
  })

  test('rejects array with non-string item', () => {
    try {
      parseInput(['ok', 42 as unknown as string])
      throw new Error('expected parseInput to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(LlmError)
      expect((e as LlmError).code).toBe('LLM_BAD_REQUEST')
    }
  })

  test('rejects array containing empty string', () => {
    expect(() => parseInput(['ok', ''])).toThrow(LlmError)
  })

  test('rejects array containing whitespace-only string', () => {
    expect(() => parseInput(['   '])).toThrow(LlmError)
    expect(() => parseInput(['ok', '\t\n'])).toThrow(LlmError)
  })

  test('error details include the original Zod issues', () => {
    try {
      parseInput(['ok', ''])
      throw new Error('expected throw')
    } catch (e) {
      const le = e as LlmError
      expect(le.details).toBeDefined()
      expect(le.details).toMatchObject({
        provider: 'openai',
        model: 'text-embedding-3-small',
      })
      expect(Array.isArray((le.details as { issues: unknown }).issues)).toBe(true)
    }
  })
})
