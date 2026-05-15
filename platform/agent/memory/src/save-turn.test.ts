import { describe, expect, it } from 'vitest'
import { extractAutoTitle } from './save-turn'

describe('extractAutoTitle', () => {
  it('returns null when no user message', () => {
    expect(extractAutoTitle([])).toBeNull()
    expect(
      extractAutoTitle([{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }]),
    ).toBeNull()
  })

  it('returns null when user message has no text content', () => {
    expect(
      extractAutoTitle([{ role: 'user', content: [{ type: 'tool_result', toolCallId: 'x', result: null }] }]),
    ).toBeNull()
  })

  it('returns null when text is empty or whitespace', () => {
    expect(
      extractAutoTitle([{ role: 'user', content: [{ type: 'text', text: '   ' }] }]),
    ).toBeNull()
  })

  it('returns text as-is when 80 chars or fewer', () => {
    const text = 'What is the weather in Hanoi today?'
    expect(
      extractAutoTitle([{ role: 'user', content: [{ type: 'text', text }] }]),
    ).toBe(text)
  })

  it('truncates text longer than 80 chars with ellipsis', () => {
    const text = 'x'.repeat(100)
    const result = extractAutoTitle([{ role: 'user', content: [{ type: 'text', text }] }])
    expect(result).toBe(`${'x'.repeat(77)}...`)
    expect(result?.length).toBe(80)
  })

  it('trims leading/trailing whitespace before checking length', () => {
    const text = '  hello  '
    expect(
      extractAutoTitle([{ role: 'user', content: [{ type: 'text', text }] }]),
    ).toBe('hello')
  })

  it('picks the first user message when multiple messages exist', () => {
    const msgs = [
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'assistant reply' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'first user' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'second user' }] },
    ]
    expect(extractAutoTitle(msgs)).toBe('first user')
  })
})
