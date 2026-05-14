import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LlmError } from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAIEmbeddings, EMBEDDING_BATCH_SIZE } from '../../src'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = path.resolve(__dirname, '__recordings__')

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || hasRecording(name)
}

function buildClient() {
  return createOpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY ?? 'sk-test',
  })
}

let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })

describe('@seta/agent-embeddings — integration (replay)', () => {
  afterEach(() => recording.stop())

  it.skipIf(!shouldRun('embed-single-batch-ok'))(
    'single batch (≤100 inputs) returns ordered embeddings and usage',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-single-batch-ok',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const client = buildClient()
      const r = await client.embed(['the quick brown fox', 'jumps over the lazy dog'])
      expect(r.embeddings).toHaveLength(2)
      expect(r.embeddings[0]).toHaveLength(1536)
      expect(r.embeddings[1]).toHaveLength(1536)
      expect(r.usage.promptTokens).toBeGreaterThan(0)
      expect(r.usage.totalTokens).toBeGreaterThanOrEqual(r.usage.promptTokens)
    },
  )

  it.skipIf(!shouldRun('embed-multi-batch-ok'))(
    'multi-batch (250 inputs) produces 3 sequential calls with aggregated usage',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-multi-batch-ok',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const client = buildClient()
      const inputs = Array.from({ length: 250 }, (_, i) => `text fragment ${i}`)
      const r = await client.embed(inputs)
      expect(r.embeddings).toHaveLength(250)
      expect(r.embeddings[0]).not.toEqual(r.embeddings.at(-1))
      expect(r.usage.promptTokens).toBeGreaterThan(0)
      expect(EMBEDDING_BATCH_SIZE).toBe(100)
    },
    30_000,
  )

  it.skipIf(!shouldRun('embed-auth-failed'))(
    'bad API key surfaces as LlmError(LLM_AUTH_FAILED) — terminal, no retry',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-auth-failed',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const client = createOpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY ?? 'sk-invalid',
      })
      let caught: unknown
      try {
        await client.embed(['hello'])
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(LlmError)
      const le = caught as LlmError
      expect(le.code).toBe('LLM_AUTH_FAILED')
      expect(le.domain).toBe('LLM')
    },
  )

  it.skipIf(!shouldRun('embed-rate-limited-then-ok'))(
    '429 then 200 — withRetry consumes the first failure and succeeds',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-rate-limited-then-ok',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      vi.useFakeTimers()
      try {
        const client = buildClient()
        const pending = client.embed(['hello']).catch((e) => e)
        await vi.runAllTimersAsync()
        const got = await pending
        expect(got).toMatchObject({
          embeddings: expect.any(Array),
          usage: expect.objectContaining({
            promptTokens: expect.any(Number),
            totalTokens: expect.any(Number),
          }),
        })
        expect((got as { embeddings: number[][] }).embeddings[0]).toHaveLength(1536)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.skipIf(!shouldRun('embed-abort-midflight'))(
    'abort mid-request — SDK surfaces AbortError and we re-throw unmapped',
    async () => {
      recording = setupLLMRecording({
        name: 'embed-abort-midflight',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const ac = new AbortController()
      const client = buildClient()
      queueMicrotask(() => ac.abort())
      let caught: unknown
      try {
        await client.embed(['hello'], { signal: ac.signal })
      } catch (e) {
        caught = e
      }
      expect(caught).not.toBeInstanceOf(LlmError)
      const err = caught as { name?: string } | null
      expect(err?.name).toBe('AbortError')
    },
  )

  it('empty input array short-circuits without any HTTP call', async () => {
    recording = setupLLMRecording({
      name: 'embed-empty-input-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const client = buildClient()
    const r = await client.embed([])
    expect(r.embeddings).toEqual([])
    expect(r.usage).toEqual({ promptTokens: 0, totalTokens: 0 })
    expect(hasRecording('embed-empty-input-MUST-NOT-RECORD')).toBe(false)
  })
})
