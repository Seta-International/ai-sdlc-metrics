import { describe, expect, it, vi } from 'vitest'
import { NullMemoryProvider } from '../memory/null-provider'
import { createAdapterRegistry } from '../models/registry'
import { FakeAdapter } from '../testkit/fake-adapter'
import type { AgentConfig, KernelChunk, MemoryProvider, RecallResult, RunInput } from '../types'
import { run } from './run'

function setup(scriptChunks: KernelChunk[]) {
  const adapters = createAdapterRegistry()
  adapters.register('fake', new FakeAdapter({ chunks: scriptChunks }))
  return { adapters }
}

const baseInput: RunInput = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
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

  it('yields abort chunk when ctx.signal aborts mid-stream', async () => {
    const ctrl = new AbortController()
    const adapters = createAdapterRegistry()
    adapters.register(
      'fake',
      new FakeAdapter({
        chunks: [
          { type: 'text', delta: '1' },
          { type: 'text', delta: '2' },
          { type: 'text', delta: '3' },
        ],
      }),
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
      new FakeAdapter({
        chunks: [{ type: 'text', delta: 'x' }],
        throwOn: { afterChunks: 1, error: { status: 500, message: 'boom' } },
      }),
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
        return new FakeAdapter({ chunks: [{ type: 'finish', reason: 'stop' }] }).stream(
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
        return new FakeAdapter({ chunks: [{ type: 'finish', reason: 'stop' }] }).stream(
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
