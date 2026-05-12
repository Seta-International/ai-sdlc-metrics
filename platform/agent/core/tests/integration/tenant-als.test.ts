import { existsSync } from 'node:fs'
import path from 'node:path'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  type AgentConfig,
  createAdapterRegistry,
  createAnthropicAdapter,
  type RunInput,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')
const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})

beforeAll(() => provider.register())
afterAll(async () => provider.shutdown())
beforeEach(() => exporter.reset())

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || hasRecording(name)
}

const FROZEN_NOW = new Date('2026-05-12T00:00:00Z').getTime()
const ctxOverrides = {
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

describe('tenant ALS across adapter await boundary', () => {
  it.skipIf(!shouldRun('tenant-als'))(
    'records tenant.id on the llm span even after `await sdk.stream(...)` crosses microtask boundary',
    async () => {
      const rec = setupLLMRecording({ name: 'tenant-als', recordingsDir: RECORDINGS_DIR })
      rec.start()
      try {
        const adapters = createAdapterRegistry()
        adapters.register(
          'anthropic',
          createAnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'sk-test' }),
        )

        const cfg: AgentConfig = {
          model: 'anthropic/claude-haiku-4-5',
          systemPrompt: 'reply with the word "ok"',
          maxTokens: 16,
        }
        const input: RunInput = {
          messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }],
        }

        await tenantContext.run({ tenantId: 'tenant-als-test' }, async () => {
          for await (const _c of run(cfg, input, { adapters, ...ctxOverrides })) {
            // drain
          }
        })

        const spans = exporter.getFinishedSpans()
        const llmSpan = spans.find((s) => s.name.startsWith('llm.'))
        expect(llmSpan).toBeDefined()
        expect(llmSpan?.attributes['tenant.id']).toBe('tenant-als-test')
      } finally {
        rec.stop()
      }
    },
  )
})
