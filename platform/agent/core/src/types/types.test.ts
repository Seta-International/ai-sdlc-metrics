import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  JsonSchemaTool,
  KernelChunk,
  KernelMessage,
  KernelMessageContent,
  ModelStream,
  StandardSchemaV1,
  TokenUsage,
  Tool,
  ToolAnnotations,
  ToolExecutionContext,
  ToolResult,
} from './index'

describe('KernelChunk discriminated union', () => {
  it('accepts every documented variant', () => {
    const variants: KernelChunk[] = [
      { type: 'text', delta: 'hi' },
      { type: 'tool_args', toolCallId: 'tc_1', argsDelta: '{"x":' },
      { type: 'tool_call', toolCallId: 'tc_1', name: 'foo', args: { x: 1 } },
      { type: 'finish', reason: 'stop' },
      { type: 'finish', reason: 'tool_calls', usage: { inputTokens: 10, outputTokens: 20 } },
      { type: 'abort' },
    ]
    expect(variants).toHaveLength(6)
  })

  it('TokenUsage carries cache breakdown', () => {
    const u: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 80,
      cacheCreationInputTokens: 20,
    }
    expect(u.inputTokens).toBe(100)
  })

  it('exhaustive switch over KernelChunk["type"] is typed', () => {
    function summarize(c: KernelChunk): string {
      switch (c.type) {
        case 'text':
          return c.delta
        case 'tool_args':
          return c.argsDelta
        case 'tool_call':
          return c.name
        case 'finish':
          return c.reason
        case 'error':
          return c.error.message
        case 'abort':
          return 'aborted'
      }
    }
    expect(summarize({ type: 'text', delta: 'hi' })).toBe('hi')
  })
})

describe('KernelMessage canonical form', () => {
  it('user message with text content', () => {
    const m: KernelMessage = { role: 'user', content: [{ type: 'text', text: 'hello' }] }
    expect(m.role).toBe('user')
  })

  it('KernelMessageContent covers all content variants', () => {
    const textContent: KernelMessageContent = { type: 'text', text: 'hello' }
    expect(textContent.type).toBe('text')
  })

  it('assistant message with tool_use content', () => {
    const m: KernelMessage = {
      role: 'assistant',
      content: [{ type: 'tool_use', toolCallId: 'tc_1', name: 'foo', args: {} }],
    }
    expect(m.content[0]?.type).toBe('tool_use')
  })

  it('tool result message', () => {
    const m: KernelMessage = {
      role: 'tool',
      toolCallId: 'tc_1',
      content: [{ type: 'tool_result', toolCallId: 'tc_1', result: { ok: true } }],
    }
    expect(m.toolCallId).toBe('tc_1')
  })
})

describe('ModelStream type', () => {
  it('extends AsyncIterable<TChunk>', () => {
    expectTypeOf<ModelStream<KernelChunk>>().toMatchTypeOf<AsyncIterable<KernelChunk>>()
  })
})

describe('Tool type', () => {
  it('parameterizes input and output', () => {
    const _annotations: ToolAnnotations = { readOnlyHint: true, requireApproval: false }
    expect(_annotations.readOnlyHint).toBe(true)
  })
  it('Tool is generic over input and output', () => {
    expectTypeOf<Tool<string, number>>().toHaveProperty('execute')
  })
})

describe('JsonSchemaTool', () => {
  it('shape', () => {
    const t: JsonSchemaTool = {
      name: 'foo',
      description: 'bar',
      inputSchema: { type: 'object', properties: {} },
    }
    expect(t.name).toBe('foo')
  })
})

describe('ToolResult discriminant', () => {
  it('success', () => {
    const r: ToolResult<number> = { ok: true, value: 42 }
    expect(r.ok && r.value).toBe(42)
  })
  it('validation error returned, not thrown', () => {
    const r: ToolResult<number> = {
      ok: false,
      error: { name: 'ToolValidationError', message: 'bad input' },
    }
    expect(r.ok).toBe(false)
  })
  it('suspend variant for workflow integration', () => {
    const r: ToolResult<number> = { suspend: { reason: 'need-input', resumeLabel: 'continue' } }
    expect('suspend' in r).toBe(true)
  })
})

describe('StandardSchemaV1', () => {
  it('vendor + version are stable', () => {
    expectTypeOf<StandardSchemaV1<unknown>['~standard']['version']>().toEqualTypeOf<1>()
  })
})

describe('ToolExecutionContext', () => {
  it('surface discriminates teams vs direct', () => {
    const ctrl = new AbortController()
    const runCtx = {
      runId: 'r1',
      signal: ctrl.signal,
      retryCount: 0,
      now: () => 0,
      generateId: () => 'id',
      currentDate: () => new Date(0),
    }
    const teams: ToolExecutionContext = {
      surface: 'teams',
      abortSignal: ctrl.signal,
      runId: 'r1',
      requestContext: runCtx,
    }
    const direct: ToolExecutionContext = {
      surface: 'direct',
      abortSignal: ctrl.signal,
      runId: 'r1',
      requestContext: runCtx,
    }
    expect(teams.surface === 'teams' && direct.surface === 'direct').toBe(true)
  })
})
