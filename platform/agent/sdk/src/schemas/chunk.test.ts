import { describe, expect, it } from 'vitest'
import { parseChunk } from './chunk'

describe('KernelChunk schema', () => {
  it('accepts a text chunk', () => {
    const raw = { type: 'text', delta: 'hi' }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a tool_args chunk', () => {
    const raw = { type: 'tool_args', toolCallId: 'c1', argsDelta: '{"q":' }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a tool_call chunk', () => {
    const raw = {
      type: 'tool_call',
      toolCallId: 'c1',
      name: 'graph.search',
      args: { q: 'x' },
    }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a finish chunk with usage', () => {
    const raw = {
      type: 'finish',
      reason: 'stop',
      usage: { inputTokens: 10, outputTokens: 2 },
    }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a finish chunk without usage', () => {
    expect(parseChunk({ type: 'finish', reason: 'tool_calls' })).toEqual({
      type: 'finish',
      reason: 'tool_calls',
    })
  })

  it('accepts an error chunk with KernelErrorJSON payload', () => {
    const raw = {
      type: 'error',
      error: {
        id: 'e1',
        code: 'TOOL_FAILED',
        domain: 'TOOL',
        category: 'THIRD_PARTY',
        message: 'boom',
      },
    }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts an abort chunk', () => {
    expect(parseChunk({ type: 'abort' })).toEqual({ type: 'abort' })
  })

  it('rejects unknown chunk types', () => {
    expect(() => parseChunk({ type: 'mystery' })).toThrow()
  })

  it('rejects missing required fields', () => {
    expect(() => parseChunk({ type: 'text' })).toThrow()
    expect(() => parseChunk({ type: 'tool_call', toolCallId: 'c' })).toThrow()
  })

  it('rejects finish chunk with invalid reason', () => {
    expect(() => parseChunk({ type: 'finish', reason: 'mystery' })).toThrow()
  })
})
