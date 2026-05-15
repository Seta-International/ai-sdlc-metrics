import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  type AgentConfig,
  createAdapterRegistry,
  createAzureOpenAIAdapter,
  type KernelChunk,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { tenantContext } from '@seta/tenancy'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || hasRecording(name)
}

function buildRegistry() {
  const reg = createAdapterRegistry()
  reg.register(
    'azure-openai',
    createAzureOpenAIAdapter({
      apiKey: process.env.AZURE_OPENAI_API_KEY ?? 'sk-test',
      endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? 'https://test.openai.azure.com',
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
    }),
  )
  return reg
}

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini'
const MODEL_ID = `azure-openai/${DEPLOYMENT}` as const

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

describe('AzureOpenAIAdapter integration (replay)', () => {
  afterEach(() => recording.stop())

  it.skipIf(!shouldRun('azure-openai-text-stream'))('text-only stream success', async () => {
    recording = setupLLMRecording({
      name: 'azure-openai-text-stream',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const cfg: AgentConfig = { model: MODEL_ID, systemPrompt: 'reply ok', maxTokens: 32 }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(
        run(
          cfg,
          { messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }] },
          { adapters, ...ctxOverrides },
        ),
      ),
    )
    expect(chunks.some((c) => c.type === 'text')).toBe(true)
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it.skipIf(!shouldRun('azure-openai-tool-call-stream'))('tool-call stream success', async () => {
    recording = setupLLMRecording({
      name: 'azure-openai-tool-call-stream',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const cfg: AgentConfig = {
      model: MODEL_ID,
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
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(
        run(
          cfg,
          {
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'call echo with text="hi"' }],
              },
            ],
          },
          { adapters, ...ctxOverrides },
        ),
      ),
    )
    expect(chunks.find((c) => c.type === 'tool_call')).toBeDefined()
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'tool_calls')).toBe(true)
  })

  it.skipIf(!shouldRun('azure-openai-429-retry'))('429 → SDK auto-retry → success', async () => {
    recording = setupLLMRecording({
      name: 'azure-openai-429-retry',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const cfg: AgentConfig = { model: MODEL_ID, systemPrompt: 'reply ok', maxTokens: 32 }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(
        run(
          cfg,
          { messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }] },
          { adapters, ...ctxOverrides },
        ),
      ),
    )
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it.skipIf(!shouldRun('azure-openai-abort'))('abort mid-stream', async () => {
    recording = setupLLMRecording({
      name: 'azure-openai-abort',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const cfg: AgentConfig = {
      model: MODEL_ID,
      systemPrompt: 'count slowly 1 to 50',
      maxTokens: 512,
    }
    const controller = new AbortController()
    const adapters = buildRegistry()
    const chunks: KernelChunk[] = []
    await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
      const iter = run(
        cfg,
        { messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }] },
        { adapters, signal: controller.signal, ...ctxOverrides },
      )
      for await (const c of iter) {
        chunks.push(c)
        if (c.type === 'text') controller.abort()
      }
    })
    expect(chunks.some((c) => c.type === 'abort')).toBe(true)
    expect(chunks.some((c) => c.type === 'error')).toBe(false)
  })
})
