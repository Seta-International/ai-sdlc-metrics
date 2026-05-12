import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  type AgentConfig,
  createAdapterRegistry,
  createAnthropicAdapter,
  type KernelChunk,
  type RunInput,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenant'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env['RECORD'] !== undefined || hasRecording(name)
}

function buildRegistry() {
  const reg = createAdapterRegistry()
  reg.register(
    'anthropic',
    createAnthropicAdapter({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? 'sk-test' }),
  )
  return reg
}

async function drain(stream: AsyncIterable<KernelChunk>): Promise<KernelChunk[]> {
  const chunks: KernelChunk[] = []
  for await (const c of stream) chunks.push(c)
  return chunks
}

const FROZEN_NOW = new Date('2026-05-12T00:00:00Z').getTime()
const ctxOverrides = {
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })

describe('AnthropicAdapter integration (replay)', () => {
  afterEach(() => {
    recording.stop()
  })

  it.skipIf(!shouldRun('anthropic-text-stream'))('text-only stream success', async () => {
    recording = setupLLMRecording({ name: 'anthropic-text-stream', recordingsDir: RECORDINGS_DIR })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      systemPrompt: 'reply with the word "ok"',
      maxTokens: 32,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )

    expect(chunks.some((c) => c.type === 'text')).toBe(true)
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it.skipIf(!shouldRun('anthropic-tool-call-stream'))('tool-call stream success', async () => {
    recording = setupLLMRecording({
      name: 'anthropic-tool-call-stream',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      maxTokens: 256,
      tools: [
        {
          id: 'echo',
          description: 'echo the given text back',
          inputSchema: z.object({ text: z.string() }) as never,
          outputSchema: z.object({ echoed: z.string() }) as never,
          async execute() {
            return { ok: true, value: { echoed: 'irrelevant' } }
          },
        },
      ],
    }
    const input: RunInput = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'use the echo tool with text="hi"' }],
        },
      ],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )

    const toolCall = chunks.find((c) => c.type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect((toolCall as { name: string }).name).toBe('echo')
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'tool_calls')).toBe(true)
  })

  it.skipIf(!shouldRun('anthropic-cache-control'))(
    'cache_control request shape and cache_*_input_tokens flow-through',
    async () => {
      recording = setupLLMRecording({
        name: 'anthropic-cache-control',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()

      const cfg: AgentConfig = {
        model: 'anthropic/claude-haiku-4-5',
        systemPrompt: 'A'.repeat(4096),
        cacheTtl: '5m',
        maxTokens: 32,
      }
      const input: RunInput = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'ok' }] }],
      }
      const adapters = buildRegistry()
      const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
        drain(run(cfg, input, { adapters, ...ctxOverrides })),
      )

      const finish = chunks.find((c) => c.type === 'finish') as
        | {
            type: 'finish'
            usage?: { cacheReadInputTokens?: number; cacheCreationInputTokens?: number }
          }
        | undefined
      expect(finish).toBeDefined()
      expect(
        (finish?.usage?.cacheCreationInputTokens ?? 0) + (finish?.usage?.cacheReadInputTokens ?? 0),
      ).toBeGreaterThan(0)
    },
  )

  it.skipIf(!shouldRun('anthropic-429-retry'))('429 → SDK auto-retry → success', async () => {
    recording = setupLLMRecording({
      name: 'anthropic-429-retry',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      systemPrompt: 'reply with the word "ok"',
      maxTokens: 32,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it.skipIf(!shouldRun('anthropic-abort'))('abort mid-stream', async () => {
    recording = setupLLMRecording({ name: 'anthropic-abort', recordingsDir: RECORDINGS_DIR })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      systemPrompt: 'count slowly 1 to 50',
      maxTokens: 512,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
    }
    const controller = new AbortController()
    const adapters = buildRegistry()

    const chunks: KernelChunk[] = []
    await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
      const iter = run(cfg, input, { adapters, signal: controller.signal, ...ctxOverrides })
      for await (const c of iter) {
        chunks.push(c)
        if (c.type === 'text') controller.abort()
      }
    })

    expect(chunks.some((c) => c.type === 'abort')).toBe(true)
    expect(chunks.some((c) => c.type === 'error')).toBe(false)
  })
})
