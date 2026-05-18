import type { DynamicToolUIPart, TextUIPart } from 'ai'
import { describe, expect, it } from 'vitest'
import type { SetaUIMessage } from './chunksToUIMessages'
import { appendChunk } from './chunksToUIMessages'

const EMPTY: SetaUIMessage[] = []

describe('appendChunk — text', () => {
  it('empty messages + text chunk → one assistant message with a text part', () => {
    const result = appendChunk(EMPTY, { type: 'text', delta: 'Hello' })
    expect(result).toHaveLength(1)
    const msg = result[0]
    expect(msg?.role).toBe('assistant')
    expect(msg?.parts).toHaveLength(1)
    const part = msg?.parts[0] as TextUIPart
    expect(part.type).toBe('text')
    expect(part.text).toBe('Hello')
    expect(part.state).toBe('streaming')
  })

  it('two text chunks concatenate into the same text part', () => {
    const after1 = appendChunk(EMPTY, { type: 'text', delta: 'Hel' })
    const after2 = appendChunk(after1, { type: 'text', delta: 'lo' })
    expect(after2).toHaveLength(1)
    const part = after2[0]?.parts[0] as TextUIPart
    expect(part.text).toBe('Hello')
    expect(after2[0]?.parts).toHaveLength(1)
  })

  it('does not mutate the input array', () => {
    const before = appendChunk(EMPTY, { type: 'text', delta: 'a' })
    const frozen = Object.freeze([...before])
    const after = appendChunk(frozen as SetaUIMessage[], { type: 'text', delta: 'b' })
    // original still has 'a'
    expect((frozen[0]?.parts[0] as TextUIPart).text).toBe('a')
    // new result has 'ab'
    expect((after[0]?.parts[0] as TextUIPart).text).toBe('ab')
  })
})

describe('appendChunk — tool_call', () => {
  it('appends a dynamic-tool part to the last assistant message', () => {
    const after = appendChunk(EMPTY, {
      type: 'tool_call',
      toolCallId: 'tc1',
      name: 'search',
      args: { query: 'cats' },
    })
    expect(after).toHaveLength(1)
    const msg = after[0]
    const part = msg?.parts.find((p) => p.type === 'dynamic-tool') as DynamicToolUIPart
    expect(part).toBeDefined()
    expect(part.toolName).toBe('search')
    expect(part.toolCallId).toBe('tc1')
    expect(part.state).toBe('input-available')
    expect(part.input).toEqual({ query: 'cats' })
  })

  it('appends tool part after text part in the same message', () => {
    const withText = appendChunk(EMPTY, { type: 'text', delta: 'thinking...' })
    const withTool = appendChunk(withText, {
      type: 'tool_call',
      toolCallId: 'tc2',
      name: 'calc',
      args: {},
    })
    expect(withTool[0]?.parts).toHaveLength(2)
    expect(withTool[0]?.parts[0]?.type).toBe('text')
    expect(withTool[0]?.parts[1]?.type).toBe('dynamic-tool')
  })
})

describe('appendChunk — tool_args', () => {
  it('accumulates argsDelta into the matching tool part', () => {
    // Simulate receiving tool_call followed by incremental args (unusual but supported)
    const withCall = appendChunk(EMPTY, {
      type: 'tool_call',
      toolCallId: 'tc3',
      name: 'stream_tool',
      args: null,
    })
    const after1 = appendChunk(withCall, {
      type: 'tool_args',
      toolCallId: 'tc3',
      argsDelta: '{"q"',
    })
    const after2 = appendChunk(after1, {
      type: 'tool_args',
      toolCallId: 'tc3',
      argsDelta: ':"x"}',
    })
    const part = after2[0]?.parts.find(
      (p): p is DynamicToolUIPart => p.type === 'dynamic-tool' && p.toolCallId === 'tc3',
    )
    expect(part?.state).toBe('input-streaming')
    expect(part?.input).toBe('{"q":"x"}')
  })

  it('creates a placeholder part when tool_args arrives before tool_call', () => {
    const result = appendChunk(EMPTY, {
      type: 'tool_args',
      toolCallId: 'tc4',
      argsDelta: 'partial',
    })
    const part = result[0]?.parts.find((p): p is DynamicToolUIPart => p.type === 'dynamic-tool')
    expect(part).toBeDefined()
    expect(part?.state).toBe('input-streaming')
    expect(part?.input).toBe('partial')
  })
})

describe('appendChunk — finish', () => {
  it('sets metadata.usage and marks text parts as done', () => {
    const withText = appendChunk(EMPTY, { type: 'text', delta: 'answer' })
    const finished = appendChunk(withText, {
      type: 'finish',
      reason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    const msg = finished[0]
    expect(msg?.metadata?.status).toBe('done')
    expect(msg?.metadata?.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
    const part = msg?.parts[0] as TextUIPart
    expect(part.state).toBe('done')
  })

  it('finish without usage sets status=done but no usage key', () => {
    const withText = appendChunk(EMPTY, { type: 'text', delta: 'x' })
    const finished = appendChunk(withText, { type: 'finish', reason: 'stop' })
    expect(finished[0]?.metadata?.status).toBe('done')
    expect(finished[0]?.metadata?.usage).toBeUndefined()
  })

  it('no-op on empty messages', () => {
    const result = appendChunk(EMPTY, { type: 'finish', reason: 'stop' })
    expect(result).toHaveLength(0)
  })
})

describe('appendChunk — error', () => {
  it('sets metadata.status=error with code and message', () => {
    const withText = appendChunk(EMPTY, { type: 'text', delta: 'partial' })
    const errored = appendChunk(withText, {
      type: 'error',
      error: {
        id: 'e1',
        code: 'TOOL_FAILED',
        domain: 'TOOL',
        category: 'THIRD_PARTY',
        message: 'tool exploded',
      },
    })
    const msg = errored[0]
    expect(msg?.metadata?.status).toBe('error')
    expect(msg?.metadata?.error).toEqual({ code: 'TOOL_FAILED', message: 'tool exploded' })
  })

  it('no-op on empty messages', () => {
    const result = appendChunk(EMPTY, {
      type: 'error',
      error: { id: 'e1', code: 'X', domain: 'AGENT', category: 'SYSTEM', message: 'm' },
    })
    expect(result).toHaveLength(0)
  })
})

describe('appendChunk — abort', () => {
  it('sets metadata.status=aborted on the last message', () => {
    const withText = appendChunk(EMPTY, { type: 'text', delta: 'partial' })
    const aborted = appendChunk(withText, { type: 'abort' })
    expect(aborted[0]?.metadata?.status).toBe('aborted')
  })

  it('no-op on empty messages', () => {
    const result = appendChunk(EMPTY, { type: 'abort' })
    expect(result).toHaveLength(0)
  })
})

describe('appendChunk — preserves prior messages', () => {
  it('user message is not modified when text chunk arrives', () => {
    const userMsg: SetaUIMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    }
    const result = appendChunk([userMsg], { type: 'text', delta: 'hey' })
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(userMsg)
    expect(result[1]?.role).toBe('assistant')
  })
})
