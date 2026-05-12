import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createAdapterRegistry } from '../models/registry'
import { FakeAdapter } from '../testkit/fake-adapter'
import type { AgentConfig, KernelChunk, KernelMessage, RunCtx, StopCondition, Tool } from '../types'
import { runToolLoop } from './tool-loop'

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

async function drain(gen: AsyncGenerator<KernelChunk, unknown>) {
  const chunks: KernelChunk[] = []
  while (true) {
    const res = await gen.next()
    if (res.done) return { chunks, ret: res.value as KernelMessage[] }
    chunks.push(res.value)
  }
}

const anySchema = z.any() as unknown as Tool['inputSchema']

function makeTool(id: string, exec: Tool['execute']): Tool {
  return { id, description: id, inputSchema: anySchema, outputSchema: anySchema, execute: exec }
}

describe('runToolLoop — natural stop', () => {
  it('returns after one model step when finishReason=stop', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [
            { type: 'text', delta: 'done' },
            { type: 'finish', reason: 'stop' },
          ],
        },
      ]),
    )
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks } = await drain(
      runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters }, initialMessages: [], tools: [] }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  })
})

describe('runToolLoop — multi-step', () => {
  it('round-trips: model -> tool -> model -> stop', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [
            { type: 'tool_call', toolCallId: 't1', name: 'echo', args: { x: 1 } },
            { type: 'finish', reason: 'tool_calls' },
          ],
          finalMessage: {
            role: 'assistant',
            content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
          },
        },
        {
          chunks: [
            { type: 'text', delta: 'done' },
            { type: 'finish', reason: 'stop' },
          ],
        },
      ]),
    )
    const tool = makeTool('echo', async (input) => ({ ok: true, value: input }))
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks, ret } = await drain(
      runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters }, initialMessages: [], tools: [tool] }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
    expect(ret.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant'])
  })
})

describe('runToolLoop — maxSteps', () => {
  it('synthesizes finish:length when step had tool_calls and limit reached, no tools executed', async () => {
    let toolCalls = 0
    const tool = makeTool('keep', async () => {
      toolCalls++
      return { ok: true, value: 1 }
    })
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [{ type: 'finish', reason: 'tool_calls' }],
          finalMessage: {
            role: 'assistant',
            content: [{ type: 'tool_use', toolCallId: 't1', name: 'keep', args: {} }],
          },
        },
      ]),
    )
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks } = await drain(
      runToolLoop({
        cfg,
        ctx: makeCtx(),
        opts: { adapters, maxSteps: 1 },
        initialMessages: [],
        tools: [tool],
      }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'length' })
    expect(toolCalls).toBe(0)
  })
})

describe('runToolLoop — stopWhen', () => {
  it('only evaluated on tool_calls, OR semantics, async-aware', async () => {
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
        { chunks: [{ type: 'finish', reason: 'stop' }] },
      ]),
    )
    const tool = makeTool('echo', async () => ({ ok: true, value: 1 }))
    const sFalse: StopCondition = async () => false
    const sTrue: StopCondition = async () => true
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks } = await drain(
      runToolLoop({
        cfg,
        ctx: makeCtx(),
        opts: { adapters, stopWhen: [sFalse, sTrue] },
        initialMessages: [],
        tools: [tool],
      }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  })

  it('predicate throw -> STOP_WHEN_FAILED error chunk', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [{ type: 'finish', reason: 'tool_calls' }],
          finalMessage: {
            role: 'assistant',
            content: [{ type: 'tool_use', toolCallId: 't1', name: 'e', args: {} }],
          },
        },
      ]),
    )
    const tool = makeTool('e', async () => ({ ok: true, value: 1 }))
    const cfg: AgentConfig = { model: 'f/x' }
    const throwing: StopCondition = () => {
      throw new Error('bad predicate')
    }
    const { chunks } = await drain(
      runToolLoop({
        cfg,
        ctx: makeCtx(),
        opts: { adapters, stopWhen: throwing },
        initialMessages: [],
        tools: [tool],
      }),
    )
    const last = chunks.at(-1)
    expect(last?.type).toBe('error')
    if (last?.type === 'error') expect(last.error.code).toBe('STOP_WHEN_FAILED')
  })
})

describe('runToolLoop — ADAPTER_PROTOCOL_VIOLATION', () => {
  it('throws when finishReason=tool_calls but no tool_use blocks', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'f',
      new FakeAdapter([
        {
          chunks: [{ type: 'finish', reason: 'tool_calls' }],
          finalMessage: {
            role: 'assistant',
            content: [{ type: 'text', text: 'oops' }],
          },
        },
      ]),
    )
    const cfg: AgentConfig = { model: 'f/x' }
    await expect(
      drain(
        runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters }, initialMessages: [], tools: [] }),
      ),
    ).rejects.toMatchObject({ code: 'ADAPTER_PROTOCOL_VIOLATION' })
  })
})
