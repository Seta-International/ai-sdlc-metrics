import { describe, expect, it } from 'vitest'
import { hashRequest, serializeRequestContent } from './hash'

describe('serializeRequestContent', () => {
  it('produces identical strings for objects with different key order', () => {
    const a = serializeRequestContent('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-5-haiku-latest',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'hello' }],
    })
    const b = serializeRequestContent('https://api.anthropic.com/v1/messages', {
      messages: [{ content: 'hello', role: 'user' }],
      max_tokens: 16,
      model: 'claude-3-5-haiku-latest',
    })
    expect(a).toBe(b)
  })

  it('sorts nested object keys deeply', () => {
    const a = serializeRequestContent('https://x/y', { a: { z: 1, a: 2 } })
    const b = serializeRequestContent('https://x/y', { a: { a: 2, z: 1 } })
    expect(a).toBe(b)
  })

  it('preserves array element order', () => {
    const a = serializeRequestContent('https://x/y', { xs: [1, 2, 3] })
    const b = serializeRequestContent('https://x/y', { xs: [3, 2, 1] })
    expect(a).not.toBe(b)
  })

  it('canonicalizes ISO date strings in values', () => {
    const a = serializeRequestContent('https://x/y', { t: '2026-05-12T00:00:00Z' })
    const b = serializeRequestContent('https://x/y', { t: '2026-05-12T00:00:00.000Z' })
    expect(a).toBe(b)
  })

  it('handles string bodies', () => {
    expect(serializeRequestContent('https://x/y', 'hello')).toBe('https://x/y:hello')
  })

  it('handles null and primitives', () => {
    expect(serializeRequestContent('https://x/y', null)).toBe('https://x/y:null')
    expect(serializeRequestContent('https://x/y', 42)).toBe('https://x/y:42')
  })
})

describe('hashRequest', () => {
  it('returns a 16-char hex string', () => {
    const h = hashRequest('https://api.openai.com/v1/chat/completions', { model: 'gpt-4o' })
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is stable across runs', () => {
    const url = 'https://api.anthropic.com/v1/messages'
    const body = { model: 'claude-3-5-haiku-latest', messages: [{ role: 'user', content: 'ping' }] }
    expect(hashRequest(url, body)).toBe(hashRequest(url, body))
  })

  it('differs when URL differs', () => {
    expect(hashRequest('https://api.anthropic.com/v1/messages', { x: 1 })).not.toBe(
      hashRequest('https://api.openai.com/v1/chat/completions', { x: 1 }),
    )
  })

  it('is invariant to key order in body', () => {
    expect(hashRequest('https://x', { a: 1, b: 2 })).toBe(hashRequest('https://x', { b: 2, a: 1 }))
  })
})
