import { describe, expect, it } from 'vitest'
import { parseChunk } from './chunk'

describe('KernelChunk schema', () => {
  it('accepts a text_delta chunk', () => {
    const raw = { type: 'text_delta', id: 'c1', runId: 'r1', ts: 0, delta: 'hi' }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a tool_call chunk', () => {
    const raw = {
      type: 'tool_call',
      id: 'c2',
      runId: 'r1',
      ts: 0,
      toolName: 'graph.search',
      input: { q: 'x' },
    }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a tool_result chunk', () => {
    const raw = {
      type: 'tool_result',
      id: 'c3',
      runId: 'r1',
      ts: 0,
      toolCallId: 'c2',
      output: { ok: true },
      durationMs: 12,
    }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts model_call_start and model_call_end', () => {
    const start = { type: 'model_call_start', id: 'm1', runId: 'r1', ts: 0, model: 'gpt-4o' }
    const end = {
      type: 'model_call_end',
      id: 'm1',
      runId: 'r1',
      ts: 1,
      tokensIn: 100,
      tokensOut: 200,
      durationMs: 500,
    }
    expect(parseChunk(start)).toEqual(start)
    expect(parseChunk(end)).toEqual(end)
  })

  it('accepts run_start, run_end, run_error', () => {
    expect(parseChunk({ type: 'run_start', id: 's', runId: 'r1', ts: 0 })).toMatchObject({
      type: 'run_start',
    })
    expect(parseChunk({ type: 'run_end', id: 'e', runId: 'r1', ts: 0 })).toMatchObject({
      type: 'run_end',
    })
    expect(
      parseChunk({
        type: 'run_error',
        id: 'x',
        runId: 'r1',
        ts: 0,
        message: 'boom',
        code: 'TOOL_FAILED',
      }),
    ).toMatchObject({ type: 'run_error', code: 'TOOL_FAILED' })
  })

  it('rejects unknown chunk types', () => {
    expect(() => parseChunk({ type: 'mystery', id: 'x', runId: 'r1', ts: 0 })).toThrow()
  })

  it('rejects missing required fields', () => {
    expect(() => parseChunk({ type: 'text_delta', id: 'x', runId: 'r1', ts: 0 })).toThrow()
  })
})
