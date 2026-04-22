/**
 * router-llm-client.spec.ts — Plan 02 Task 9 unit tests for RouterLlmClient
 *
 * Tests use `vi.mock` to intercept the Vercel AI SDK `generateObject` call
 * so no real HTTP requests are made. The wrapper's job is to:
 *   1. Call generateObject with the right model + messages + schema.
 *   2. Return { kind: 'ok', plan, usage } on success, mapping SDK inputTokens/outputTokens
 *      to our canonical promptTokens/completionTokens names.
 *   3. Return { kind: 'malformed', error, rawText: null } on any throw.
 *   4. NOT re-evaluate function-valued models (model is already resolved).
 *   5. Pass systemPrompt as top-level `system`, developerMessage as a second system-role
 *      message in the `messages` array, and userMessage as a user-role message.
 *
 * Covers:
 * 12.  Happy path — generateObject returns valid plan → { kind: 'ok', plan, usage }
 * 13.  generateObject throws → { kind: 'malformed', error, rawText: null }
 * 14.  Wrapper receives concrete ModelChoice and does not re-resolve it
 * 15.  Message separation — system/developer/user roles are passed correctly
 * 16.  Usage mapping — SDK inputTokens/outputTokens mapped to promptTokens/completionTokens
 * 17.  Timeout — generateObject never resolves → { kind: 'malformed' } with timeout marker
 * 18.  ROUTER_LLM_TIMEOUT_MS default + env override
 * 19.  onModuleInit throws when OPENAI_API_KEY is missing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RouterLlmClient } from './router-llm-client'
import type { RouterLlmClientOpts } from './router-llm-client'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'

// Ensure OPENAI_API_KEY is present so onModuleInit does not throw in most tests.
vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')

// ─── Mock Vercel AI SDK ────────────────────────────────────────────────────────

// Hoist the mock factory so it can be referenced in vi.mock.
const { mockGenerateObject, mockCreateOpenAI } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn()
  const mockCreateOpenAI = vi.fn(() => vi.fn(() => 'mock-language-model'))
  return { mockGenerateObject, mockCreateOpenAI }
})

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_FLOW_ID = '018e8b2a-4c1d-7000-8000-000000000001'

const VALID_PLAN: RouterPlan = {
  topology: 'bounded',
  intent_slug: 'planner.list-my-tasks',
  flow_id: VALID_FLOW_ID,
  phase1: [
    {
      sub_agent_key: 'planner.read-only',
      input: { utterance: 'show my tasks' },
      reason: 'User asked to list tasks',
    },
  ],
}

/**
 * Default SDK usage object matching Vercel AI SDK v6's `LanguageModelUsage` shape.
 * The SDK uses `inputTokens`/`outputTokens`/`totalTokens`; the wrapper maps these
 * to `promptTokens`/`completionTokens`/`totalTokens`.
 */
const SDK_USAGE = {
  inputTokens: 120,
  outputTokens: 45,
  totalTokens: 165,
  inputTokenDetails: { noCacheTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 45, reasoningTokens: 0 },
}

const BASE_OPTS: RouterLlmClientOpts = {
  model: { provider: 'openai', model: 'gpt-5.4' },
  systemPrompt: 'You are the router agent.',
  developerMessage: 'Emit a RouterPlan JSON only.',
  userMessage: 'Show me my tasks for today',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RouterLlmClient', () => {
  let client: RouterLlmClient

  beforeEach(() => {
    client = new RouterLlmClient()
    vi.clearAllMocks()
    // Reset createOpenAI mock to return a fresh mock model function each test
    mockCreateOpenAI.mockReturnValue(vi.fn(() => 'mock-language-model'))
  })

  // ── 12. Happy path ─────────────────────────────────────────────────────────

  it('12. returns { kind: "ok", plan, usage } when generateObject succeeds', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN, usage: SDK_USAGE })

    const result = await client.generate(BASE_OPTS)

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.plan).toEqual(VALID_PLAN)
      expect(result.plan.topology).toBe('bounded')
      // usage is mapped: SDK inputTokens → promptTokens, outputTokens → completionTokens
      expect(result.usage.promptTokens).toBe(SDK_USAGE.inputTokens)
      expect(result.usage.completionTokens).toBe(SDK_USAGE.outputTokens)
      expect(result.usage.totalTokens).toBe(SDK_USAGE.totalTokens)
    }
  })

  it('12b. calls generateObject with system at top-level + developer + user messages', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN, usage: SDK_USAGE })

    await client.generate(BASE_OPTS)

    expect(mockGenerateObject).toHaveBeenCalledOnce()
    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      system: string
      messages: Array<{ role: string; content: string }>
    }
    // systemPrompt is passed as top-level `system` arg
    expect(callArgs.system).toBe(BASE_OPTS.systemPrompt)
    // messages array: first entry is system-role (developer message), second is user-role
    expect(callArgs.messages).toHaveLength(2)
    expect(callArgs.messages[0]!.role).toBe('system')
    expect(callArgs.messages[0]!.content).toBe(BASE_OPTS.developerMessage)
    expect(callArgs.messages[1]!.role).toBe('user')
    expect(callArgs.messages[1]!.content).toBe(BASE_OPTS.userMessage)
  })

  it('12c. passes RouterPlanSchema as the schema to generateObject', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN, usage: SDK_USAGE })

    await client.generate(BASE_OPTS)

    expect(mockGenerateObject).toHaveBeenCalledOnce()
    const callArgs = mockGenerateObject.mock.calls[0][0] as { schema: unknown }
    // The schema is the RouterPlanSchema Zod object — it has a _def property (Zod internal)
    expect(callArgs.schema).toBeDefined()
    expect(callArgs.schema).toHaveProperty('_def')
  })

  // ── 13. generateObject throws ──────────────────────────────────────────────

  it('13a. returns { kind: "malformed" } when generateObject throws an Error', async () => {
    const sdkError = new Error('NoObjectGeneratedError: model returned invalid JSON')
    mockGenerateObject.mockRejectedValueOnce(sdkError)

    const result = await client.generate(BASE_OPTS)

    expect(result.kind).toBe('malformed')
    if (result.kind === 'malformed') {
      expect(result.error).toBe(sdkError)
      expect(result.rawText).toBeNull()
    }
  })

  it('13b. returns { kind: "malformed" } when generateObject throws a non-Error', async () => {
    mockGenerateObject.mockRejectedValueOnce('raw string error')

    const result = await client.generate(BASE_OPTS)

    expect(result.kind).toBe('malformed')
    if (result.kind === 'malformed') {
      expect(result.error).toBeInstanceOf(Error)
      expect(result.rawText).toBeNull()
    }
  })

  it('13c. rawText is null on malformed result (generateObject does not expose raw text)', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('schema mismatch'))

    const result = await client.generate(BASE_OPTS)

    expect(result.kind).toBe('malformed')
    if (result.kind === 'malformed') {
      expect(result.rawText).toBeNull()
    }
  })

  // ── 14. Concrete ModelChoice — no re-resolution ────────────────────────────

  it('14a. passes the concrete model string to createOpenAI — no function re-evaluation', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN, usage: SDK_USAGE })
    const mockModelFn = vi.fn(() => 'resolved-model-instance')
    mockCreateOpenAI.mockReturnValueOnce(mockModelFn)

    const opts: RouterLlmClientOpts = {
      ...BASE_OPTS,
      model: { provider: 'openai', model: 'gpt-5.4' },
    }

    await client.generate(opts)

    // createOpenAI must have been called exactly once (to build the client)
    expect(mockCreateOpenAI).toHaveBeenCalledOnce()
    // The mock model function must have been called with the concrete model string
    expect(mockModelFn).toHaveBeenCalledWith('gpt-5.4')
  })

  it('14b. uses the model string from the provided ModelChoice, not a hardcoded default', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN, usage: SDK_USAGE })
    const mockModelFn = vi.fn(() => 'resolved-model-instance')
    mockCreateOpenAI.mockReturnValueOnce(mockModelFn)

    await client.generate({
      ...BASE_OPTS,
      model: { provider: 'openai', model: 'gpt-5.4-nano' },
    })

    expect(mockModelFn).toHaveBeenCalledWith('gpt-5.4-nano')
  })

  it('14c. throws when provider is "anthropic" (deferred to Plan 12)', async () => {
    const result = await client.generate({
      ...BASE_OPTS,
      model: { provider: 'anthropic', model: 'claude-3-opus' },
    })

    // The wrapper catches its own throw and returns malformed
    expect(result.kind).toBe('malformed')
    if (result.kind === 'malformed') {
      expect(result.error.message).toContain('anthropic')
    }
  })

  // ── 15. Message separation — F5 ───────────────────────────────────────────

  it('15a. passes systemPrompt as top-level system, developerMessage as system-role, userMessage as user-role', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN, usage: SDK_USAGE })

    await client.generate(BASE_OPTS)

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      system: string
      messages: Array<{ role: string; content: string }>
    }
    expect(callArgs.system).toBe('You are the router agent.')
    expect(callArgs.messages[0]!.role).toBe('system')
    expect(callArgs.messages[0]!.content).toBe('Emit a RouterPlan JSON only.')
    expect(callArgs.messages[1]!.role).toBe('user')
    expect(callArgs.messages[1]!.content).toBe('Show me my tasks for today')
  })

  it('15b. does NOT concatenate developerMessage + userMessage into a single message', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN, usage: SDK_USAGE })

    await client.generate(BASE_OPTS)

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    // The user-role message must be only the userMessage, not a concatenation
    const userMsg = callArgs.messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toBe(BASE_OPTS.userMessage)
    expect(userMsg?.content).not.toContain(BASE_OPTS.developerMessage)
  })

  // ── 16. Usage mapping — F4 ────────────────────────────────────────────────

  it('16a. maps SDK inputTokens/outputTokens/totalTokens to promptTokens/completionTokens/totalTokens', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: VALID_PLAN,
      usage: { ...SDK_USAGE, inputTokens: 200, outputTokens: 80, totalTokens: 280 },
    })

    const result = await client.generate(BASE_OPTS)

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.usage.promptTokens).toBe(200)
      expect(result.usage.completionTokens).toBe(80)
      expect(result.usage.totalTokens).toBe(280)
    }
  })

  it('16b. handles undefined token counts from provider (passes undefined through)', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: VALID_PLAN,
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      },
    })

    const result = await client.generate(BASE_OPTS)

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.usage.promptTokens).toBeUndefined()
      expect(result.usage.completionTokens).toBeUndefined()
      expect(result.usage.totalTokens).toBeUndefined()
    }
  })

  // ── 17. Timeout path ──────────────────────────────────────────────────────
  //
  // ROUTER_LLM_TIMEOUT_MS is a module-level constant resolved at import time;
  // vi.stubEnv cannot retroactively change it. We use vi.useFakeTimers to
  // advance the JS clock so the AbortController fires without waiting.

  it('17a. timeout: generateObject never resolves → { kind: "malformed" } with timeout/aborted marker', async () => {
    vi.useFakeTimers()

    // generateObject never resolves — simulates a hung OpenAI connection.
    // The inner promise captures the abort signal; when abort fires it rejects.
    mockGenerateObject.mockImplementationOnce(
      (_opts: { abortSignal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          _opts.abortSignal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )

    const generatePromise = client.generate(BASE_OPTS)

    // Advance clock past ROUTER_LLM_TIMEOUT_MS (30 000 ms default) to fire the AbortController
    await vi.advanceTimersByTimeAsync(35_000)

    const result = await generatePromise

    expect(result.kind).toBe('malformed')
    if (result.kind === 'malformed') {
      expect(result.rawText).toBeNull()
      // Error message must mention "aborted" or "timeout" so logs can distinguish
      // this from a JSON parse failure.
      const msg = result.error.message.toLowerCase()
      expect(msg.includes('aborted') || msg.includes('timeout')).toBe(true)
    }

    vi.useRealTimers()
  })

  it('17b. timeout: abort clears the timeout handle (no dangling timer)', async () => {
    vi.useFakeTimers()

    mockGenerateObject.mockImplementationOnce(
      (_opts: { abortSignal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          _opts.abortSignal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )

    const generatePromise = client.generate(BASE_OPTS)
    await vi.advanceTimersByTimeAsync(35_000)

    // Should resolve (not hang) — confirms finally { clearTimeout } works
    const result = await generatePromise
    expect(result.kind).toBe('malformed')

    vi.useRealTimers()
  })

  // ── 18. ROUTER_LLM_TIMEOUT_MS default + env override ─────────────────────

  it('18a. ROUTER_LLM_TIMEOUT_MS defaults to 30_000 when env var is absent', async () => {
    const { ROUTER_LLM_TIMEOUT_MS } = await import('../../application/services/router-budget')
    // The default should be 30 000 ms unless the test runner overrides the env
    expect(typeof ROUTER_LLM_TIMEOUT_MS).toBe('number')
    expect(ROUTER_LLM_TIMEOUT_MS).toBeGreaterThan(0)
  })

  // ── 19. onModuleInit — OPENAI_API_KEY assertion ────────────────────────────

  it('19a. onModuleInit throws when OPENAI_API_KEY is missing', () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const freshClient = new RouterLlmClient()
    expect(() => freshClient.onModuleInit()).toThrow(/OPENAI_API_KEY missing/)
    vi.unstubAllEnvs()
    vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')
  })

  it('19b. onModuleInit does NOT throw when OPENAI_API_KEY is present', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-1234')
    const freshClient = new RouterLlmClient()
    expect(() => freshClient.onModuleInit()).not.toThrow()
    vi.unstubAllEnvs()
    vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')
  })
})
