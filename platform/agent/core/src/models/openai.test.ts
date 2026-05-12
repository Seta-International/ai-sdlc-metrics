import { describe, expect, it } from 'vitest'
import { createOpenAIAdapter } from './openai'

describe('createOpenAIAdapter', () => {
  it('returns a ModelAdapter with provider="openai"', () => {
    const adapter = createOpenAIAdapter({ apiKey: 'test' })
    expect(adapter.provider).toBe('openai')
    expect(typeof adapter.stream).toBe('function')
  })

  it('accepts baseURL for LiteLLM / OpenAI-compatible proxies', () => {
    const adapter = createOpenAIAdapter({ apiKey: 'test', baseURL: 'https://proxy.example/v1' })
    expect(adapter.provider).toBe('openai')
  })
})
