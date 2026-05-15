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
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenancy'
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

describe('K4 loop — abort mid-stream', () => {
  afterEach(() => recording.stop())

  it.skipIf(!shouldRun('loop-abort-openai'))(
    'caller abort -> abort chunk, single model span, no further model calls',
    async () => {
      recording = setupLLMRecording({
        name: 'loop-abort-openai',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()

      const adapters = createAdapterRegistry()
      adapters.register(
        'openai',
        createOpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-test' }),
      )

      const cfg: AgentConfig = {
        model: 'openai/gpt-4o-mini',
        systemPrompt: 'reply with a long paragraph',
        maxTokens: 512,
      }
      const input: RunInput = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
      }
      const ctrl = new AbortController()

      const chunks: KernelChunk[] = []
      await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
        let textSeen = 0
        for await (const c of run(cfg, input, {
          adapters,
          signal: ctrl.signal,
          ...ctxOverrides,
        })) {
          chunks.push(c)
          if (c.type === 'text' && ++textSeen === 1) ctrl.abort()
        }
      })

      expect(chunks.at(-1)).toEqual({ type: 'abort' })
      const llmSpans = exporter.getFinishedSpans().filter((s) => s.name.startsWith('llm.'))
      expect(llmSpans).toHaveLength(1)
      const loopSpan = exporter.getFinishedSpans().find((s) => s.name === 'agent.run.loop')
      expect(loopSpan?.attributes['loop.stop_reason']).toBe('aborted')
    },
  )
})
