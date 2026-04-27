/**
 * synthesizer-llm-client.spec.ts — Plan 17 PR 3 Task 9 (Plan 18 §1 amendment).
 *
 * Tests OpenAiSynthesizerLlmClient — a thin wrapper around Vercel AI SDK
 * `streamObject` that exposes:
 *   - `partialObjectStream` (async iterable of progressively-grown partials),
 *   - `finalObject` (Promise<SynthesizerLlmOutput>),
 *   - `usage` (Promise<SubAgentUsage>).
 *
 * The streaming semantics (per-shape diff emission, narrative/list incremental
 * tokens, table/chart atomic JSON token, post-shape fallback) live in Task 11's
 * adapter — this client just returns the SDK's streaming primitive in a typed
 * shape with the OPENAI_API_KEY boot guard and exhaustive provider switch
 * mirroring the sibling LLM clients.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as z from 'zod'

// Ensure OPENAI_API_KEY is present so resolveModel does not blow up on createOpenAI.
vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')

// ─── Mock Vercel AI SDK ────────────────────────────────────────────────────────

const { mockStreamObject, mockCreateOpenAI } = vi.hoisted(() => {
  const mockStreamObject = vi.fn()
  const mockCreateOpenAI = vi.fn(() => vi.fn((model: string) => ({ provider: 'openai', model })))
  return { mockStreamObject, mockCreateOpenAI }
})

vi.mock('ai', () => ({
  streamObject: mockStreamObject,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

// Imports must come after the mocks are wired.
import {
  OpenAiSynthesizerLlmClient,
  type SynthesizerLlmClient,
  type SynthesizerLlmClientOpts,
} from './synthesizer-llm-client'
import { SynthesizerOutputSchema } from '../../domain/value-objects/synthesizer-output-schema'
import type { ModelChoice } from '../../domain/services/sub-agent-types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function* asyncFrom<T>(values: ReadonlyArray<T>): AsyncIterable<T> {
  for (const v of values) {
    yield v
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseOpts: SynthesizerLlmClientOpts = {
  model: { provider: 'openai', model: 'gpt-5.4' },
  system: 'sys',
  userContext: 'user-context',
  schema: SynthesizerOutputSchema as unknown as z.ZodType,
  abortSignal: new AbortController().signal,
}

const finalNarrative = { shape: 'narrative' as const, content: 'hello' }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OpenAiSynthesizerLlmClient', () => {
  beforeEach(() => {
    mockStreamObject.mockReset()
    mockCreateOpenAI.mockClear()
    mockCreateOpenAI.mockImplementation(() =>
      vi.fn((model: string) => ({ provider: 'openai', model })),
    )
  })

  it('calls streamObject with the supplied schema, system, prompt, maxRetries:0, and resolves finalObject + usage', async () => {
    mockStreamObject.mockReturnValueOnce({
      partialObjectStream: asyncFrom([finalNarrative]),
      object: Promise.resolve(finalNarrative),
      usage: Promise.resolve({ inputTokens: 11, outputTokens: 22, totalTokens: 33 }),
    })

    const client: SynthesizerLlmClient = new OpenAiSynthesizerLlmClient()
    const result = client.synthesize(baseOpts)

    expect(mockStreamObject).toHaveBeenCalledTimes(1)
    const call = mockStreamObject.mock.calls[0]![0] as {
      schema: unknown
      system: string
      prompt: string
      maxRetries: number
      abortSignal: AbortSignal | undefined
    }
    expect(call.schema).toBe(baseOpts.schema)
    expect(call.system).toBe('sys')
    expect(call.prompt).toBe('user-context')
    expect(call.maxRetries).toBe(0)
    expect(call.abortSignal).toBe(baseOpts.abortSignal)

    await expect(result.finalObject).resolves.toEqual(finalNarrative)

    const usage = await result.usage
    expect(usage.inputTokens).toBe(11)
    expect(usage.outputTokens).toBe(22)
    expect(usage.inputCachedRead).toBe(0)
    expect(usage.inputCachedWrite).toBe(0)
    expect(usage.outputReasoning).toBe(0)
    expect(usage.costUsd).toBe(0)
  })

  it('propagates cache-read, cache-write, and reasoning token details into SubAgentUsage', async () => {
    mockStreamObject.mockReturnValueOnce({
      partialObjectStream: asyncFrom([finalNarrative]),
      object: Promise.resolve(finalNarrative),
      usage: Promise.resolve({
        inputTokens: 100,
        outputTokens: 200,
        inputTokenDetails: { cacheReadTokens: 30, cacheWriteTokens: 10 },
        outputTokenDetails: { reasoningTokens: 50 },
      }),
    })

    const client = new OpenAiSynthesizerLlmClient()
    const result = client.synthesize(baseOpts)

    await expect(result.usage).resolves.toEqual({
      inputTokens: 100,
      outputTokens: 200,
      inputCachedRead: 30,
      inputCachedWrite: 10,
      outputReasoning: 50,
      costUsd: 0,
    })
  })

  it('partialObjectStream throws on mid-flight upstream error and finalObject rejects', async () => {
    const upstreamError = new Error('stream broke')
    mockStreamObject.mockReturnValueOnce({
      partialObjectStream: (async function* () {
        yield { shape: 'narrative' as const }
        throw upstreamError
      })(),
      object: Promise.reject(upstreamError),
      usage: Promise.reject(upstreamError),
    })

    const client = new OpenAiSynthesizerLlmClient()
    const result = client.synthesize(baseOpts)

    const collected: unknown[] = []
    await expect(async () => {
      for await (const partial of result.partialObjectStream) {
        collected.push(partial)
      }
    }).rejects.toBe(upstreamError)
    expect(collected).toEqual([{ shape: 'narrative' }])

    await expect(result.finalObject).rejects.toBe(upstreamError)
    // Drain `usage` rejection to avoid an unhandled rejection warning.
    await expect(result.usage).rejects.toBe(upstreamError)
  })

  it('partialObjectStream yields progressive partials (full-grow semantics, not deltas)', async () => {
    const partials = [
      { shape: 'narrative' as const },
      { shape: 'narrative' as const, content: 'h' },
      { shape: 'narrative' as const, content: 'he' },
      { shape: 'narrative' as const, content: 'hello' },
    ]
    mockStreamObject.mockReturnValueOnce({
      partialObjectStream: asyncFrom(partials),
      object: Promise.resolve(finalNarrative),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    })

    const client = new OpenAiSynthesizerLlmClient()
    const result = client.synthesize(baseOpts)

    const collected: Array<Partial<{ shape: string; content: string }>> = []
    for await (const p of result.partialObjectStream) {
      collected.push(p as Partial<{ shape: string; content: string }>)
    }

    expect(collected).toHaveLength(4)
    expect(collected[3]).toEqual(finalNarrative)
  })

  it('propagates abortSignal to streamObject', async () => {
    const ac = new AbortController()
    mockStreamObject.mockImplementationOnce((input: { abortSignal?: AbortSignal }) => {
      expect(input.abortSignal).toBe(ac.signal)
      return {
        partialObjectStream: asyncFrom([finalNarrative]),
        object: Promise.resolve(finalNarrative),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      }
    })

    const client = new OpenAiSynthesizerLlmClient()
    client.synthesize({ ...baseOpts, abortSignal: ac.signal })

    expect(mockStreamObject).toHaveBeenCalledTimes(1)
  })

  it('throws when synthesize is called with an unsupported provider', () => {
    const client = new OpenAiSynthesizerLlmClient()
    const unsupportedOpts: SynthesizerLlmClientOpts = {
      ...baseOpts,
      model: { provider: 'anthropic', model: 'claude-sonnet' } as ModelChoice,
    }
    expect(() => client.synthesize(unsupportedOpts)).toThrow(/anthropic/)
  })

  // ── onModuleInit — OPENAI_API_KEY assertion ────────────────────────────────

  describe('onModuleInit', () => {
    it('throws when OPENAI_API_KEY is missing', () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv('LOCAL_DEV', '') // clear local-dev bypass so guard fires
      const freshClient = new OpenAiSynthesizerLlmClient()
      expect(() => freshClient.onModuleInit()).toThrow(/OPENAI_API_KEY missing/)
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')
    })

    it('does NOT throw when OPENAI_API_KEY is present', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-1234')
      const freshClient = new OpenAiSynthesizerLlmClient()
      expect(() => freshClient.onModuleInit()).not.toThrow()
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')
    })

    it('does NOT throw when LOCAL_DEV is set even without OPENAI_API_KEY', () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv('LOCAL_DEV', '1')
      const freshClient = new OpenAiSynthesizerLlmClient()
      expect(() => freshClient.onModuleInit()).not.toThrow()
      vi.unstubAllEnvs()
      vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')
    })
  })
})
