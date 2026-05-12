import { describe, expect, it } from 'vitest'
import { LlmError } from '../errors'
import type { ModelAdapter } from '../models/adapter'
import { createAdapterRegistry } from '../models/registry'
import { FakeAdapter } from '../testkit/fake-adapter'
import type { AdapterRequest, AgentConfig, KernelChunk, ModelStream, RunCtx } from '../types'
import { runModelStepWithFallback } from './fallback'

function makeCtx(signal = new AbortController().signal): RunCtx {
  return {
    runId: 'r',
    signal,
    retryCount: 0,
    now: () => 0,
    generateId: () => 'id',
    currentDate: () => new Date(0),
  }
}

async function drain<T, U>(gen: AsyncGenerator<T, U>): Promise<{ chunks: T[]; ret: U }> {
  const chunks: T[] = []
  while (true) {
    const res = await gen.next()
    if (res.done) return { chunks, ret: res.value }
    chunks.push(res.value)
  }
}

class ThrowAdapter implements ModelAdapter {
  readonly provider = 'x'
  private calls = 0
  constructor(private readonly errs: unknown[]) {}
  async stream(_req: AdapterRequest, _ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
    const err = this.errs[this.calls++]
    if (err === undefined) throw new Error('adapter exhausted')
    throw err
  }
}

describe('runModelStepWithFallback — primary success', () => {
  it('uses cfg.model and ignores cfg.fallback', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'p',
      new FakeAdapter([
        {
          chunks: [
            { type: 'text', delta: 'hi' },
            { type: 'finish', reason: 'stop' },
          ],
        },
      ]),
    )
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [
            { type: 'text', delta: 'fb' },
            { type: 'finish', reason: 'stop' },
          ],
        },
      ]),
    )
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { chunks, ret } = await drain(
      runModelStepWithFallback({
        cfg,
        ctx: makeCtx(),
        opts: { adapters },
        messages: [],
        tools: undefined,
      }),
    )
    expect(
      chunks.map((c: KernelChunk) => (c.type === 'text' ? c.delta : null)).filter(Boolean),
    ).toEqual(['hi'])
    expect(ret.kind).toBe('model')
    expect(ret.finishReason).toBe('stop')
  })
})

describe('runModelStepWithFallback — failover', () => {
  it('transient on primary -> fallback succeeds', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'p',
      new ThrowAdapter([
        new LlmError({
          code: 'LLM_TRANSIENT_EXHAUSTED',
          category: 'THIRD_PARTY',
          message: '503',
        }),
      ]),
    )
    adapters.register('f', new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]))
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { ret } = await drain(
      runModelStepWithFallback({
        cfg,
        ctx: makeCtx(),
        opts: { adapters },
        messages: [],
        tools: undefined,
      }),
    )
    expect(ret.finishReason).toBe('stop')
  })

  it('non-failover error on primary -> no fallback, error chunk', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'p',
      new ThrowAdapter([
        new LlmError({ code: 'LLM_AUTH_FAILED', category: 'SYSTEM', message: '401' }),
      ]),
    )
    adapters.register('f', new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]))
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { chunks, ret } = await drain(
      runModelStepWithFallback({
        cfg,
        ctx: makeCtx(),
        opts: { adapters },
        messages: [],
        tools: undefined,
      }),
    )
    expect(chunks.at(-1)?.type).toBe('error')
    expect(ret.error?.code).toBe('LLM_AUTH_FAILED')
  })

  it('chain exhausted -> surfaces last error', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'p',
      new ThrowAdapter([
        new LlmError({ code: 'LLM_SERVER_ERROR', category: 'THIRD_PARTY', message: '500' }),
      ]),
    )
    adapters.register(
      'f',
      new ThrowAdapter([
        new LlmError({ code: 'LLM_RATE_LIMITED', category: 'THIRD_PARTY', message: '429' }),
      ]),
    )
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { ret } = await drain(
      runModelStepWithFallback({
        cfg,
        ctx: makeCtx(),
        opts: { adapters },
        messages: [],
        tools: undefined,
      }),
    )
    expect(ret.error?.code).toBe('LLM_RATE_LIMITED')
  })

  it('processAPIError "retry" reattempts the same model (bounded by maxProcessorRetries=1)', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'p',
      new ThrowAdapter([
        new LlmError({ code: 'LLM_BAD_REQUEST', category: 'SYSTEM', message: '400' }),
        new LlmError({ code: 'LLM_BAD_REQUEST', category: 'SYSTEM', message: '400 again' }),
      ]),
    )
    const cfg: AgentConfig = { model: 'p/x' }
    const opts = {
      adapters,
      processors: [{ processAPIError: async () => 'retry' as const }],
    }
    const { ret } = await drain(
      runModelStepWithFallback({ cfg, ctx: makeCtx(), opts, messages: [], tools: undefined }),
    )
    expect(ret.error?.code).toBe('LLM_BAD_REQUEST')
  })

  it('abort during failover stops further attempts', async () => {
    const ctrl = new AbortController()
    const adapters = createAdapterRegistry()
    adapters.register('p', {
      provider: 'p',
      async stream() {
        ctrl.abort()
        const e = new Error('aborted')
        e.name = 'AbortError'
        throw e
      },
    } as ModelAdapter)
    adapters.register('f', new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]))
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    await expect(
      drain(
        runModelStepWithFallback({
          cfg,
          ctx: makeCtx(ctrl.signal),
          opts: { adapters },
          messages: [],
          tools: undefined,
        }),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
