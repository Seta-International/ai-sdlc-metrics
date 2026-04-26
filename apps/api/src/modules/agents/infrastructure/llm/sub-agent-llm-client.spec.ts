/**
 * sub-agent-llm-client.spec.ts — Plan 17 PR 2 Task 3 unit tests.
 *
 * Tests the OpenAiSubAgentLlmClient wrapper around Vercel AI SDK `generateText`:
 *   1. Calls generateText with maxRetries:0, stopWhen: stepCountIs(maxIterations),
 *      and experimental_output: Output.object({ schema }).
 *   2. Falls back to generateObject when experimental_output is missing.
 *   3. Propagates abortSignal through to generateText.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as z from 'zod'

// Ensure OPENAI_API_KEY is present so resolveModel does not blow up on createOpenAI.
vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')

// ─── Mock Vercel AI SDK ────────────────────────────────────────────────────────

const {
  mockGenerateText,
  mockGenerateObject,
  mockStepCountIs,
  mockOutputObject,
  mockCreateOpenAI,
} = vi.hoisted(() => {
  const mockGenerateText = vi.fn()
  const mockGenerateObject = vi.fn()
  const mockStepCountIs = vi.fn((n: number) => ({ kind: 'stepCountIs', n }))
  const mockOutputObject = vi.fn(({ schema }: { schema: unknown }) => ({
    kind: 'object',
    schema,
  }))
  const mockCreateOpenAI = vi.fn(() => vi.fn((model: string) => ({ provider: 'openai', model })))
  return {
    mockGenerateText,
    mockGenerateObject,
    mockStepCountIs,
    mockOutputObject,
    mockCreateOpenAI,
  }
})

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  generateObject: mockGenerateObject,
  stepCountIs: mockStepCountIs,
  Output: { object: mockOutputObject },
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

// Imports must come after the mocks are wired.
import {
  OpenAiSubAgentLlmClient,
  type SubAgentLlmClient,
  type SubAgentLlmClientOpts,
} from './sub-agent-llm-client'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const outputSchema = z.object({ ok: z.boolean() })

const baseOpts: SubAgentLlmClientOpts = {
  model: { provider: 'openai', model: 'gpt-5.4-nano' },
  system: 'sys',
  userMessage: 'user',
  tools: {},
  outputSchema,
  maxIterations: 4,
  abortSignal: new AbortController().signal,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OpenAiSubAgentLlmClient', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGenerateObject.mockReset()
    mockStepCountIs.mockClear()
    mockOutputObject.mockClear()
    mockCreateOpenAI.mockClear()
    mockCreateOpenAI.mockImplementation(() =>
      vi.fn((model: string) => ({ provider: 'openai', model })),
    )
  })

  it('calls generateText with maxRetries:0, stopWhen stepCountIs(maxIterations), experimental_output schema, and maps result', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '',
      steps: [],
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      finishReason: 'stop',
      experimental_output: { ok: true },
    })
    const client: SubAgentLlmClient = new OpenAiSubAgentLlmClient()

    const result = await client.runWithTools(baseOpts)

    expect(mockGenerateText).toHaveBeenCalledTimes(1)
    const call = mockGenerateText.mock.calls[0]![0] as {
      maxRetries: number
      system: string
      prompt: string
      stopWhen: unknown
      experimental_output: unknown
      tools: unknown
    }
    expect(call.maxRetries).toBe(0)
    expect(call.system).toBe('sys')
    expect(call.prompt).toBe('user')
    expect(call.stopWhen).toEqual({ kind: 'stepCountIs', n: 4 })
    expect(mockStepCountIs).toHaveBeenCalledWith(4)
    expect(call.experimental_output).toEqual({ kind: 'object', schema: outputSchema })
    expect(mockOutputObject).toHaveBeenCalledWith({ schema: outputSchema })

    expect(result.rawStructured).toEqual({ ok: true })
    expect(result.usage.inputTokens).toBe(1)
    expect(result.usage.outputTokens).toBe(2)
    expect(result.usage.inputCachedRead).toBe(0)
    expect(result.usage.inputCachedWrite).toBe(0)
    expect(result.usage.outputReasoning).toBe(0)
    expect(result.usage.costUsd).toBe(0)
    expect(result.finishReason).toBe('stop')
  })

  it('falls back to generateObject when experimental_output is unavailable', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '{"ok":true}',
      steps: [],
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      finishReason: 'stop',
      // no experimental_output
    })
    mockGenerateObject.mockResolvedValueOnce({ object: { ok: true } })

    const client = new OpenAiSubAgentLlmClient()
    const result = await client.runWithTools(baseOpts)

    expect(mockGenerateObject).toHaveBeenCalledTimes(1)
    const fallbackCall = mockGenerateObject.mock.calls[0]![0] as {
      schema: unknown
      prompt: string
      maxRetries: number
    }
    expect(fallbackCall.schema).toBe(outputSchema)
    expect(fallbackCall.prompt).toBe('{"ok":true}')
    expect(fallbackCall.maxRetries).toBe(0)
    expect(result.rawStructured).toEqual({ ok: true })
  })

  it('propagates abortSignal to generateText', async () => {
    const ac = new AbortController()
    mockGenerateText.mockImplementationOnce(async (input: { abortSignal?: AbortSignal }) => {
      expect(input.abortSignal).toBe(ac.signal)
      return {
        text: '',
        steps: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
        experimental_output: { ok: true },
      }
    })
    const client = new OpenAiSubAgentLlmClient()
    await client.runWithTools({ ...baseOpts, abortSignal: ac.signal })
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })
})
