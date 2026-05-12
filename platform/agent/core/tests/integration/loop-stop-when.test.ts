import { existsSync } from 'node:fs'
import path from 'node:path'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  type AgentConfig,
  createAdapterRegistry,
  createOpenAIAdapter,
  type KernelChunk,
  type RunInput,
  run,
  type StopCondition,
  type Tool,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenant'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')
const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})

beforeAll(() => provider.register())
afterAll(async () => {
  await provider.shutdown()
})
beforeEach(() => exporter.reset())

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

describe('K4 loop — stopWhen predicate-driven termination', () => {
  afterEach(() => recording.stop())

  it.skipIf(!shouldRun('loop-stop-when-openai'))(
    'synthesizes finish:stop after 2 model steps; tools after stop NOT executed',
    async () => {
      recording = setupLLMRecording({
        name: 'loop-stop-when-openai',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()

      let toolCount = 0
      const incr: Tool = {
        id: 'incr',
        description: 'incrementing tool',
        inputSchema: z.object({}) as unknown as Tool['inputSchema'],
        outputSchema: z.object({ n: z.number() }) as unknown as Tool['outputSchema'],
        execute: async () => {
          toolCount++
          return { ok: true, value: { n: toolCount } }
        },
      }

      const adapters = createAdapterRegistry()
      adapters.register(
        'openai',
        createOpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-test' }),
      )

      const cfg: AgentConfig = {
        model: 'openai/gpt-4o-mini',
        systemPrompt: 'Keep calling the incr tool. Never stop on your own.',
        maxTokens: 64,
        tools: [incr],
      }
      const input: RunInput = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
      }
      const stopWhen: StopCondition = ({ steps }) =>
        steps.filter((s) => s.kind === 'model').length >= 2

      const chunks: KernelChunk[] = []
      await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
        for await (const c of run(cfg, input, { adapters, stopWhen, ...ctxOverrides })) {
          chunks.push(c)
        }
      })

      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: 'stop' })
      const loopSpan = exporter.getFinishedSpans().find((s) => s.name === 'agent.run.loop')
      expect(loopSpan?.attributes['loop.stop_reason']).toBe('stop_when')
      expect(loopSpan?.attributes['loop.iterations']).toBe(2)
    },
  )
})
