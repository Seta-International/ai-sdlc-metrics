import { describe, expect, it } from 'vitest'
import { LlmError } from '../errors'
import { createAnthropicAdapter } from './anthropic'

describe('createAnthropicAdapter', () => {
  it('returns a ModelAdapter with provider="anthropic"', () => {
    const adapter = createAnthropicAdapter({ apiKey: 'test' })
    expect(adapter.provider).toBe('anthropic')
    expect(typeof adapter.stream).toBe('function')
  })
})

describe('LlmError import surface', () => {
  // Full HTTP error mapping is covered in tests/integration/anthropic.test.ts via MSW.
  it('exposes LlmError as the thrown class shape', () => {
    expect(LlmError).toBeDefined()
  })
})
