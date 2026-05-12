import { existsSync } from 'node:fs'
import path from 'node:path'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  type AgentConfig,
  createAdapterRegistry,
  createAnthropicAdapter,
  type KernelChunk,
  type MemoryProvider,
  type RunInput,
  run,
  type Tool,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenant'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')
const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})

beforeAll(() => {
  provider.register()
})
afterAll(async () => {
  await provider.shutdown()
})
beforeEach(() => {
  exporter.reset()
})

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

const FROZEN_NOW = new Date('2026-05-12T00:00:00Z').getTime()
const ctxOverrides = {
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })

describe('K4 loop — multi-step round-trip (anthropic)', () => {
  afterEach(() => recording.stop())

  it.skipIf(!shouldRun('loop-multi-step-anthropic'))('round-trip', async () => {
    recording = setupLLMRecording({
      name: 'loop-multi-step-anthropic',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()

    const adapters = createAdapterRegistry()
    adapters.register(
      'anthropic',
      createAnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'sk-test' }),
    )

    const echo: Tool = {
      id: 'echo',
      description: 'echo back the input',
      inputSchema: z.object({ message: z.string() }) as unknown as Tool['inputSchema'],
      outputSchema: z.object({ message: z.string() }) as unknown as Tool['outputSchema'],
      execute: async (input) => ({ ok: true, value: input }),
    }

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      systemPrompt: 'Call the echo tool with message="hi", then reply with "done".',
      maxTokens: 256,
      tools: [echo],
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
    }

    const saveTurn = vi.fn<MemoryProvider['saveTurn']>(async () => {})
    const mem: MemoryProvider = {
      recall: async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false }),
      saveTurn,
      getWorkingMemory: async () => null,
      updateWorkingMemory: async () => {},
    }

    const chunks: KernelChunk[] = []
    await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
      for await (const c of run(cfg, input, { adapters, memory: mem, ...ctxOverrides })) {
        chunks.push(c)
      }
    })

    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: 'stop' })
    expect(saveTurn).toHaveBeenCalledOnce()
    const saved = saveTurn.mock.calls[0]?.[1]
    expect(saved?.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])

    const spans = exporter.getFinishedSpans()
    const loopSpan = spans.find((s) => s.name === 'agent.run.loop')
    expect(loopSpan?.attributes['loop.stop_reason']).toBe('natural_stop')
    expect(loopSpan?.attributes['loop.iterations']).toBe(2)
    expect(spans.filter((s) => s.name === 'llm.anthropic.stream')).toHaveLength(2)
    expect(spans.filter((s) => s.name === 'tool.echo.execute')).toHaveLength(1)
  })
})
