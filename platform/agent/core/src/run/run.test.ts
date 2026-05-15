import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { NullMemoryProvider } from '../memory/null-provider'
import type { ModelAdapter } from '../models/adapter'
import { createAdapterRegistry } from '../models/registry'
import { FakeAdapter } from '../testkit/fake-adapter'
import type {
  AdapterRequest,
  AgentConfig,
  KernelChunk,
  KernelMessage,
  ModelStream,
  MemoryProvider,
  RecallResult,
  RunCtx,
  RunInput,
  Tool,
} from '../types'
import { run } from './run'

function setup(scriptChunks: KernelChunk[]) {
  const adapters = createAdapterRegistry()
  adapters.register('fake', new FakeAdapter([{ chunks: scriptChunks }]))
  return { adapters }
}

const baseInput: RunInput = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
}

class CapturingAdapter implements ModelAdapter {
  readonly provider = 'capture'
  readonly requests: AdapterRequest[] = []
  private callIndex = 0

  constructor(private readonly finalMessages: KernelMessage[]) {}

  async stream(req: AdapterRequest, _ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
    this.requests.push(req)
    const finalMessage = this.finalMessages[this.callIndex]
    this.callIndex++
    if (!finalMessage) throw new Error('CapturingAdapter script exhausted')
    return {
      abort: () => {},
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'finish',
          reason: finalMessage.content.some((part) => part.type === 'tool_use')
            ? 'tool_calls'
            : 'stop',
        } satisfies KernelChunk
      },
      finalMessage: async () => finalMessage,
    }
  }
}

describe('run()', () => {
  it('emits chunks from the adapter in order', async () => {
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([
      { type: 'text', delta: 'hello' },
      { type: 'finish', reason: 'stop' },
    ])
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters })) got.push(c)
    expect(got).toEqual([
      { type: 'text', delta: 'hello' },
      { type: 'finish', reason: 'stop' },
    ])
  })

  it('calls memory.recall before streaming and saveTurn after', async () => {
    const mem: MemoryProvider = {
      recall: vi.fn(
        async () =>
          ({
            messages: [
              { role: 'user' as const, content: [{ type: 'text' as const, text: 'prior' }] },
            ],
            total: 1,
            page: 1,
            perPage: 1,
            hasMore: false,
          }) satisfies RecallResult,
      ),
      saveTurn: vi.fn(async () => {}),
      getWorkingMemory: vi.fn(async () => null),
      updateWorkingMemory: vi.fn(async () => {}),
    }
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([
      { type: 'text', delta: 'reply' },
      { type: 'finish', reason: 'stop' },
    ])
    for await (const _c of run(cfg, baseInput, { adapters, memory: mem })) {
      void _c
    }
    expect(mem.recall).toHaveBeenCalledOnce()
    expect(mem.saveTurn).toHaveBeenCalledOnce()
    const saved = (mem.saveTurn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as unknown[]
    expect(saved.length).toBe(2)
  })

  it('defaults to NullMemoryProvider when memory not supplied', async () => {
    const recallSpy = vi.spyOn(NullMemoryProvider.prototype, 'recall')
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([{ type: 'finish', reason: 'stop' }])
    for await (const _c of run(cfg, baseInput, { adapters })) {
      void _c
    }
    expect(recallSpy).toHaveBeenCalled()
    recallSpy.mockRestore()
  })

  it('injects working memory and lets the model update it through the memory tool', async () => {
    const savedTurns: KernelMessage[][] = []
    const mem: MemoryProvider = {
      recall: vi.fn(async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false })),
      saveTurn: vi.fn(async (_ctx, messages) => {
        savedTurns.push(messages)
      }),
      getWorkingMemory: vi.fn(async () => '- Name: Linh'),
      updateWorkingMemory: vi.fn(async () => {}),
    }
    const adapter = new CapturingAdapter([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            toolCallId: 'wm-1',
            name: 'updateWorkingMemory',
            args: { memory: '- Name: Linh\n- Location: Hanoi' },
          },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'noted' }] },
    ])
    const adapters = createAdapterRegistry()
    adapters.register('capture', adapter)

    const cfg: AgentConfig = {
      model: 'capture/test',
      workingMemory: {
        enabled: true,
        template: '- Name:\n- Location:',
        scope: 'resource',
      },
    }

    for await (const _c of run(cfg, baseInput, { adapters, memory: mem })) {
      void _c
    }

    expect(mem.getWorkingMemory).toHaveBeenCalledTimes(2)
    expect(mem.updateWorkingMemory).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'resource' }),
      '- Name: Linh\n- Location: Hanoi',
    )
    expect(adapter.requests[0]?.messages[0]).toMatchObject({
      role: 'system',
      content: [expect.objectContaining({ type: 'text', text: expect.stringContaining('- Name: Linh') })],
    })
    expect(adapter.requests[0]?.tools?.map((t) => t.name)).toContain('updateWorkingMemory')
    expect(savedTurns).toHaveLength(1)
    const persisted = savedTurns[0] ?? []
    expect(
      persisted.some((m) =>
        m.content.some(
          (part) =>
            (part.type === 'tool_use' && part.name === 'updateWorkingMemory') ||
            (part.type === 'tool_result' && part.toolCallId === 'wm-1'),
        ),
      ),
    ).toBe(false)
    expect(persisted.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'noted' }],
    })
  })

  it('injects JSON schema working memory and serializes object updates', async () => {
    const mem: MemoryProvider = {
      recall: vi.fn(async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false })),
      saveTurn: vi.fn(async () => {}),
      getWorkingMemory: vi.fn(async () => '{"user":{"name":"Linh"},"score":1}'),
      updateWorkingMemory: vi.fn(async () => {}),
    }
    const adapter = new CapturingAdapter([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            toolCallId: 'wm-json',
            name: 'updateWorkingMemory',
            args: { memory: { user: { name: 'Linh', email: '' }, score: 2 } },
          },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ])
    const adapters = createAdapterRegistry()
    adapters.register('capture', adapter)

    const cfg: AgentConfig = {
      model: 'capture/test',
      workingMemory: {
        enabled: true,
        schema: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
            },
            score: { type: 'number' },
          },
        },
      },
    }

    for await (const _c of run(cfg, baseInput, { adapters, memory: mem })) {
      void _c
    }

    const instruction = adapter.requests[0]?.messages[0]?.content[0]
    expect(instruction).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Use JSON format for all data'),
    })
    expect(instruction).toMatchObject({
      type: 'text',
      text: expect.stringContaining('"user":{"name":"","email":""}'),
    })
    expect(instruction).toMatchObject({
      type: 'text',
      text: expect.stringContaining('"score":0'),
    })
    expect(mem.updateWorkingMemory).toHaveBeenCalledWith(
      expect.anything(),
      '{"user":{"name":"Linh","email":""},"score":2}',
    )
  })

  it('refreshes working memory system message before each subsequent model step', async () => {
    let wmCallCount = 0
    const mem: MemoryProvider = {
      recall: vi.fn(async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false })),
      saveTurn: vi.fn(async () => {}),
      getWorkingMemory: vi.fn(async () => {
        wmCallCount++
        return wmCallCount === 1 ? '- Name: Linh' : '- Name: Linh\n- Location: Hanoi'
      }),
      updateWorkingMemory: vi.fn(async () => {}),
    }
    const adapter = new CapturingAdapter([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            toolCallId: 'wm-refresh',
            name: 'updateWorkingMemory',
            args: { memory: '- Name: Linh\n- Location: Hanoi' },
          },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ])
    const adapters = createAdapterRegistry()
    adapters.register('capture', adapter)

    const cfg: AgentConfig = {
      model: 'capture/test',
      workingMemory: { enabled: true, template: '- Name:\n- Location:', scope: 'resource' },
    }

    for await (const _c of run(cfg, baseInput, { adapters, memory: mem })) void _c

    // First request sees initial WM
    expect(adapter.requests[0]?.messages[0]).toMatchObject({
      role: 'system',
      content: [expect.objectContaining({ text: expect.stringContaining('- Name: Linh') })],
    })
    // Second request sees refreshed WM
    expect(adapter.requests[1]?.messages[0]).toMatchObject({
      role: 'system',
      content: [
        expect.objectContaining({ text: expect.stringContaining('- Name: Linh\n- Location: Hanoi') }),
      ],
    })
  })

  it('calls onIterationComplete after each iteration with accumulated steps', async () => {
    const iterationSnapshots: number[] = []
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [{ type: 'finish', reason: 'tool_calls' }],
          finalMessage: {
            role: 'assistant',
            content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: {} }],
          },
        },
        { chunks: [{ type: 'text', delta: 'ok' }, { type: 'finish', reason: 'stop' }] },
      ]),
    )
    const echo: Tool = {
      id: 'echo',
      description: 'echo',
      inputSchema: z.object({}) as unknown as Tool['inputSchema'],
      outputSchema: z.object({}) as unknown as Tool['inputSchema'],
      execute: async () => ({ ok: true, value: {} }),
    }
    const cfg: AgentConfig = { model: 'f/x', tools: [echo] }
    for await (const _c of run(cfg, baseInput, {
      adapters,
      onIterationComplete: (steps) => { iterationSnapshots.push(steps.length) },
    })) void _c

    // onIterationComplete is called once per tool_calls iteration
    expect(iterationSnapshots).toHaveLength(1)
    // After 1 model step + 1 tool step = 2 accumulated steps
    expect(iterationSnapshots[0]).toBe(2)
  })

  it('yields abort chunk when ctx.signal aborts mid-stream', async () => {
    const ctrl = new AbortController()
    const adapters = createAdapterRegistry()
    adapters.register(
      'fake',
      new FakeAdapter([
        {
          chunks: [
            { type: 'text', delta: '1' },
            { type: 'text', delta: '2' },
            { type: 'text', delta: '3' },
          ],
        },
      ]),
    )
    const cfg: AgentConfig = { model: 'fake/test' }
    const got: KernelChunk[] = []
    let i = 0
    for await (const c of run(cfg, baseInput, { adapters, signal: ctrl.signal })) {
      got.push(c)
      if (++i === 1) ctrl.abort()
    }
    expect(got[got.length - 1]).toEqual({ type: 'abort' })
  })

  it('yields error chunk on adapter throw (non-abort)', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'fake',
      new FakeAdapter([
        {
          chunks: [{ type: 'text', delta: 'x' }],
          throwOn: { afterChunks: 1, error: { status: 500, message: 'boom' } },
        },
      ]),
    )
    const cfg: AgentConfig = { model: 'fake/test' }
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters })) got.push(c)
    const last = got[got.length - 1]
    expect(last?.type).toBe('error')
    if (last?.type === 'error') expect(last.error.code).toBe('UNKNOWN_KERNEL_ERROR')
  })

  it('yields error chunk when provider is unregistered', async () => {
    const adapters = createAdapterRegistry()
    const cfg: AgentConfig = { model: 'cohere/r-plus' }
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters })) got.push(c)
    expect(got).toHaveLength(1)
    expect(got[0]?.type).toBe('error')
    if (got[0]?.type === 'error') expect(got[0].error.code).toBe('ADAPTER_NOT_REGISTERED')
  })

  it('auto-defaults cacheTtl to 5m when systemPrompt > 2048 chars', async () => {
    const seenReqs: unknown[] = []
    const sentinelAdapter = {
      provider: 'fake',
      async stream(req: unknown) {
        seenReqs.push(req)
        return new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]).stream(
          req as Parameters<FakeAdapter['stream']>[0],
          {
            runId: 'x',
            signal: new AbortController().signal,
            retryCount: 0,
            now: () => 0,
            generateId: () => 'x',
            currentDate: () => new Date(0),
          },
        )
      },
    }
    const adapters = createAdapterRegistry()
    adapters.register('fake', sentinelAdapter as never)
    const cfg: AgentConfig = { model: 'fake/test', systemPrompt: 'x'.repeat(2049) }
    for await (const _c of run(cfg, baseInput, { adapters })) {
      void _c
    }
    expect((seenReqs[0] as { cacheTtl: unknown }).cacheTtl).toBe('5m')
  })

  it('does not auto-set cacheTtl when systemPrompt is short', async () => {
    const seenReqs: unknown[] = []
    const sentinelAdapter = {
      provider: 'fake',
      async stream(req: unknown) {
        seenReqs.push(req)
        return new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]).stream(
          req as Parameters<FakeAdapter['stream']>[0],
          {
            runId: 'x',
            signal: new AbortController().signal,
            retryCount: 0,
            now: () => 0,
            generateId: () => 'x',
            currentDate: () => new Date(0),
          },
        )
      },
    }
    const adapters = createAdapterRegistry()
    adapters.register('fake', sentinelAdapter as never)
    const cfg: AgentConfig = { model: 'fake/test', systemPrompt: 'short' }
    for await (const _c of run(cfg, baseInput, { adapters })) {
      void _c
    }
    expect((seenReqs[0] as { cacheTtl: unknown }).cacheTtl).toBe(null)
  })

  it('aborts the underlying model stream on consumer break (generator.return)', async () => {
    const abortSpy = vi.fn()
    const stoppingAdapter = {
      provider: 'fake',
      async stream() {
        return {
          abort: abortSpy,
          finalMessage: async () => ({ role: 'assistant' as const, content: [] }),
          async *[Symbol.asyncIterator]() {
            yield { type: 'text', delta: 'a' } as KernelChunk
            yield { type: 'text', delta: 'b' } as KernelChunk
            yield { type: 'text', delta: 'c' } as KernelChunk
          },
        }
      },
    }
    const adapters = createAdapterRegistry()
    adapters.register('fake', stoppingAdapter as never)
    const cfg: AgentConfig = { model: 'fake/test' }
    const iter = run(cfg, baseInput, { adapters })[Symbol.asyncIterator]()
    await iter.next()
    await iter.return?.(undefined)
    expect(abortSpy).toHaveBeenCalled()
  })
})

describe('run() — validation', () => {
  it('yields INVALID_MAX_STEPS when maxSteps <= 0', async () => {
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([{ type: 'finish', reason: 'stop' }])
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters, maxSteps: 0 })) got.push(c)
    expect(got[0]?.type).toBe('error')
    if (got[0]?.type === 'error') expect(got[0].error.code).toBe('INVALID_MAX_STEPS')
  })

  it('yields INVALID_CONCURRENCY when toolCallConcurrency <= 0', async () => {
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([{ type: 'finish', reason: 'stop' }])
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters, toolCallConcurrency: 0 })) got.push(c)
    expect(got[0]?.type).toBe('error')
    if (got[0]?.type === 'error') expect(got[0].error.code).toBe('INVALID_CONCURRENCY')
  })
})

const anySchema = z.any() as unknown as Tool['inputSchema']

describe('run() — multi-step', () => {
  it('saveTurn called per-step during run and once more at the end', async () => {
    const saveTurn = vi.fn<MemoryProvider['saveTurn']>(async () => {})
    const mem: MemoryProvider = {
      recall: async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false }),
      saveTurn,
      getWorkingMemory: async () => null,
      updateWorkingMemory: async () => {},
    }
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [{ type: 'finish', reason: 'tool_calls' }],
          finalMessage: {
            role: 'assistant',
            content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
          },
        },
        {
          chunks: [
            { type: 'text', delta: 'ok' },
            { type: 'finish', reason: 'stop' },
          ],
        },
      ]),
    )
    const echo: Tool = {
      id: 'echo',
      description: 'echo',
      inputSchema: anySchema,
      outputSchema: anySchema,
      execute: async (input) => ({ ok: true, value: input }),
    }
    const cfg: AgentConfig = { model: 'f/x', tools: [echo] }
    for await (const _c of run(cfg, baseInput, { adapters, memory: mem })) void _c

    // saveTurn called twice: once per-step (iteration messages) + once final (all messages)
    expect(saveTurn).toHaveBeenCalledTimes(2)
    // Per-step call saves the assistant+tool iteration messages (no user input yet)
    const perStepSaved = saveTurn.mock.calls[0]?.[1]
    expect(perStepSaved?.map((m) => m.role)).toEqual(['assistant', 'tool'])
    // Final call saves all messages including user input (idempotent for already-saved ones)
    const finalSaved = saveTurn.mock.calls[1]?.[1]
    expect(finalSaved?.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  })

  it('saveTurn skipped on abort', async () => {
    const ctrl = new AbortController()
    const saveTurn = vi.fn<MemoryProvider['saveTurn']>(async () => {})
    const mem: MemoryProvider = {
      recall: async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false }),
      saveTurn,
      getWorkingMemory: async () => null,
      updateWorkingMemory: async () => {},
    }
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [
            { type: 'text', delta: 'a' },
            { type: 'text', delta: 'b' },
            { type: 'text', delta: 'c' },
            { type: 'finish', reason: 'stop' },
          ],
        },
      ]),
    )
    const cfg: AgentConfig = { model: 'f/x' }
    let i = 0
    for await (const _c of run(cfg, baseInput, { adapters, memory: mem, signal: ctrl.signal })) {
      void _c
      if (++i === 1) ctrl.abort()
    }
    expect(saveTurn).not.toHaveBeenCalled()
  })

  it('saveTurn skipped on error chunk', async () => {
    const saveTurn = vi.fn<MemoryProvider['saveTurn']>(async () => {})
    const mem: MemoryProvider = {
      recall: async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false }),
      saveTurn,
      getWorkingMemory: async () => null,
      updateWorkingMemory: async () => {},
    }
    const adapters = createAdapterRegistry()
    const cfg: AgentConfig = { model: 'cohere/r-plus' }
    for await (const _c of run(cfg, baseInput, { adapters, memory: mem })) void _c
    expect(saveTurn).not.toHaveBeenCalled()
  })
})
