import { describe, expect, it } from 'vitest'
import type { KernelMessage } from '../types'
import { countTokens, estimateMessagesInputTokens } from './tokens'

describe('countTokens', () => {
  it('returns 0 for empty string', () => {
    expect(countTokens('', 'gpt-4o')).toBe(0)
  })

  it('returns >0 for non-empty string', () => {
    expect(countTokens('hello world', 'gpt-4o')).toBeGreaterThan(0)
  })

  it('uses a stable encoding for unknown models (falls back to cl100k_base)', () => {
    const known = countTokens('hello world', 'gpt-4o')
    const unknown = countTokens('hello world', 'some-future-model')
    expect(unknown).toBe(known)
  })
})

describe('estimateMessagesInputTokens', () => {
  it('returns 0 for no system + no messages', () => {
    expect(estimateMessagesInputTokens([], undefined, 'gpt-4o')).toBe(0)
  })

  it('counts system prompt tokens', () => {
    const n = estimateMessagesInputTokens([], 'you are a helpful assistant', 'gpt-4o')
    expect(n).toBeGreaterThan(0)
  })

  it('counts text-content message tokens', () => {
    const messages: KernelMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]
    expect(estimateMessagesInputTokens(messages, undefined, 'gpt-4o')).toBeGreaterThan(0)
  })

  it('stringifies tool_use args and tool_result results', () => {
    const messages: KernelMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
      },
      {
        role: 'tool',
        toolCallId: 't1',
        content: [{ type: 'tool_result', toolCallId: 't1', result: { ok: true } }],
      },
    ]
    expect(estimateMessagesInputTokens(messages, undefined, 'gpt-4o')).toBeGreaterThan(0)
  })

  it('sums system + messages', () => {
    const messages: KernelMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]
    const onlyMsgs = estimateMessagesInputTokens(messages, undefined, 'gpt-4o')
    const onlySys = estimateMessagesInputTokens([], 'system text', 'gpt-4o')
    const both = estimateMessagesInputTokens(messages, 'system text', 'gpt-4o')
    expect(both).toBe(onlyMsgs + onlySys)
  })
})
