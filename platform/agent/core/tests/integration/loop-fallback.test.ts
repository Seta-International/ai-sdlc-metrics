import { existsSync } from 'node:fs'
import path from 'node:path'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  type AgentConfig,
  createAdapterRegistry,
  createAnthropicAdapter,
  createOpenAIAdapter,
  type KernelChunk,
  type RunInput,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenant'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

describe('K4 loop — fallback failover', () => {
  afterEach(() => recording.stop())

  it.skipIf(!shouldRun('loop-fallback-anthropic-503'))(
    'anthropic 503 -> openai success',
    async () => {
      recording = setupLLMRecording({
        name: 'loop-fallback-anthropic-503',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()

      const adapters = createAdapterRegistry()
      adapters.register(
        'anthropic',
        createAnthropicAdapter({
          apiKey: process.env.ANTHROPIC_API_KEY ?? 'sk-test',
          maxRetries: 0,
        }),
      )
      adapters.register(
        'openai',
        createOpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-test' }),
      )

      const cfg: AgentConfig = {
        model: 'anthropic/claude-haiku-4-5',
        fallback: ['openai/gpt-4o-mini'],
        systemPrompt: 'reply with "ok"',
        maxTokens: 32,
      }
      const input: RunInput = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
      }
      const chunks: KernelChunk[] = []
      await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
        for await (const c of run(cfg, input, { adapters, ...ctxOverrides })) chunks.push(c)
      })

      expect(chunks.at(-1)?.type).toBe('finish')
      expect(chunks.some((c) => c.type === 'error')).toBe(false)
      const llmSpans = exporter.getFinishedSpans().filter((s) => s.name.startsWith('llm.'))
      expect(llmSpans.map((s) => s.attributes['llm.provider'])).toEqual(['anthropic', 'openai'])
    },
  )
})
