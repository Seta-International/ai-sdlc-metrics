import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  AdapterRequest,
  AgentConfig,
  JsonSchemaTool,
  KernelChunk,
  KernelMessage,
  KernelMessageContent,
  MemoryContext,
  MemoryProvider,
  ModelStream,
  Processor,
  ProcessorContext,
  RecallResult,
  Run,
  RunInput,
  RunLoopOptions,
  RunStatus,
  StandardSchemaV1,
  StepResult,
  StopCondition,
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

  it('carries an optional id', () => {
    const withId: KernelMessage = {
      id: '00000000-0000-4000-8000-000000000000',
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    }
    const without: KernelMessage = { role: 'user', content: [{ type: 'text', text: 'hi' }] }
    expectTypeOf(withId.id).toEqualTypeOf<string | undefined>()
    expectTypeOf(without.id).toEqualTypeOf<string | undefined>()
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

describe('Run + RunCtx (extended)', () => {
  it('RunStatus is a closed union', () => {
    const statuses: RunStatus[] = ['created', 'running', 'completed', 'failed']
    expect(statuses).toHaveLength(4)
  })

  it('Run carries tenantId', () => {
    const r: Run = {
      id: '0192...',
      status: 'running',
      tenantId: 'tnt_123',
      createdAt: new Date(),
    }
    expect(r.status).toBe('running')
  })

  it('StepResult discriminates model vs tool', () => {
    const m: StepResult = { kind: 'model', chunks: [] }
    const t: StepResult = { kind: 'tool', chunks: [] }
    expect(m.kind === 'model' || t.kind === 'tool').toBe(true)
  })

  it('RunInput holds messages and optional thread/conversation ids', () => {
    const i: RunInput = { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }
    expect(i.messages).toHaveLength(1)
  })
})

describe('MemoryProvider seam', () => {
  it('shape: 4 hooks', () => {
    class TestMem implements MemoryProvider {
      async recall(): Promise<RecallResult> {
        return { messages: [], total: 0, page: 1, perPage: 0, hasMore: false }
      }
      async saveTurn(): Promise<void> {}
      async getWorkingMemory(): Promise<string | null> {
        return null
      }
      async updateWorkingMemory(): Promise<void> {}
    }
    const m = new TestMem()
    expect(typeof m.recall).toBe('function')
  })

  it('MemoryContext omits tenantId and resourceId', () => {
    const ctx: MemoryContext = { threadId: 't1', scope: 'thread' }
    // @ts-expect-error tenantId is not on the interface
    const _bad: MemoryContext = { threadId: 't1', scope: 'thread', tenantId: 'x' }
    void _bad
    expect(ctx.threadId).toBe('t1')
  })
})

describe('Processor seam', () => {
  it('all three hooks are optional', () => {
    const p: Processor = {}
    expect(p.processInput).toBeUndefined()
    expect(p.processOutputStep).toBeUndefined()
    expect(p.processAPIError).toBeUndefined()
  })

  it('ProcessorContext shape', () => {
    const ctrl = new AbortController()
    const ctx: ProcessorContext = {
      runId: 'r1',
      abort: (() => {
        throw new Error('aborted')
      }) as ProcessorContext['abort'],
      abortSignal: ctrl.signal,
      retryCount: 0,
      writer: { custom: () => {} },
    }
    expect(ctx.runId).toBe('r1')
  })
})

describe('Configuration', () => {
  it('AgentConfig uses provider-qualified model id', () => {
    const cfg: AgentConfig = { model: 'anthropic/claude-4-7-sonnet' }
    expect(cfg.model.includes('/')).toBe(true)
  })

  it('RunLoopOptions requires the adapters registry', () => {
    // @ts-expect-error adapters is required
    const _bad: RunLoopOptions = {}
    void _bad
    expect(true).toBe(true)
  })

  it('StopCondition returns boolean or Promise<boolean>', () => {
    const sync: StopCondition = () => true
    const asyncCond: StopCondition = async () => false
    expect(typeof sync).toBe('function')
    expect(typeof asyncCond).toBe('function')
  })

  it('AdapterRequest carries a bare model id', () => {
    const r: AdapterRequest = {
      model: 'claude-4-7-sonnet',
      messages: [],
    }
    expect(r.model.includes('/')).toBe(false)
  })
})
