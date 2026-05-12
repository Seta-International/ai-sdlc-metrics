import { describe, expect, it, vi } from 'vitest'
import { AgentError } from '../errors'
import type { ModelAdapter } from './adapter'
import { createAdapterRegistry } from './registry'

function fakeAdapter(provider: string): ModelAdapter {
  return {
    provider,
    stream: vi.fn(),
  }
}

describe('createAdapterRegistry', () => {
  it('register + get round-trip', () => {
    const reg = createAdapterRegistry()
    const a = fakeAdapter('anthropic')
    reg.register('anthropic', a)
    expect(reg.get('anthropic')).toBe(a)
  })

  it('register throws on duplicate', () => {
    const reg = createAdapterRegistry()
    reg.register('openai', fakeAdapter('openai'))
    expect(() => reg.register('openai', fakeAdapter('openai'))).toThrow(AgentError)
    try {
      reg.register('openai', fakeAdapter('openai'))
    } catch (e) {
      expect((e as AgentError).code).toBe('ADAPTER_ALREADY_REGISTERED')
    }
  })

  it('get returns undefined for unregistered provider', () => {
    const reg = createAdapterRegistry()
    expect(reg.get('nope')).toBeUndefined()
  })

  it('select parses <provider>/<model>', () => {
    const reg = createAdapterRegistry()
    const a = fakeAdapter('anthropic')
    reg.register('anthropic', a)
    const r = reg.select('anthropic/claude-4-7-sonnet')
    expect(r.adapter).toBe(a)
    expect(r.bareModel).toBe('claude-4-7-sonnet')
  })

  it('select supports bare model ids that contain slashes', () => {
    const reg = createAdapterRegistry()
    const a = fakeAdapter('openai')
    reg.register('openai', a)
    const r = reg.select('openai/litellm/llama-3.1-70b')
    expect(r.bareModel).toBe('litellm/llama-3.1-70b')
  })

  it.each([
    '',
    'noslash',
    '/leading',
    'trailing/',
    '/',
  ])('select throws AgentError(INVALID_MODEL_ID) for %s', (bad) => {
    const reg = createAdapterRegistry()
    try {
      reg.select(bad)
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError)
      expect((e as AgentError).code).toBe('INVALID_MODEL_ID')
    }
  })

  it('select throws AgentError(ADAPTER_NOT_REGISTERED) with knownProviders list', () => {
    const reg = createAdapterRegistry()
    reg.register('anthropic', fakeAdapter('anthropic'))
    reg.register('openai', fakeAdapter('openai'))
    try {
      reg.select('cohere/command-r')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError)
      expect((e as AgentError).code).toBe('ADAPTER_NOT_REGISTERED')
      expect((e as AgentError).details).toEqual({
        knownProviders: expect.arrayContaining(['anthropic', 'openai']),
      })
    }
  })
})
