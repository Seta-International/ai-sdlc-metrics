/**
 * router-llm-client.spec.ts — Plan 02 Task 9 unit tests for RouterLlmClient
 *
 * Tests use `vi.mock` to intercept the Vercel AI SDK `generateObject` call
 * so no real HTTP requests are made. The wrapper's job is to:
 *   1. Call generateObject with the right model + messages + schema.
 *   2. Return { kind: 'ok', plan } on success.
 *   3. Return { kind: 'malformed', error, rawText: null } on any throw.
 *   4. NOT re-evaluate function-valued models (model is already resolved).
 *
 * Covers:
 * 12.  Happy path — generateObject returns valid plan → { kind: 'ok', plan }
 * 13.  generateObject throws → { kind: 'malformed', error, rawText: null }
 * 14.  Wrapper receives concrete ModelChoice and does not re-resolve it
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RouterLlmClient } from './router-llm-client'
import type { RouterLlmClientOpts } from './router-llm-client'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'

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

  it('12. returns { kind: "ok", plan } when generateObject succeeds', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN })

    const result = await client.generate(BASE_OPTS)

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.plan).toEqual(VALID_PLAN)
      expect(result.plan.topology).toBe('bounded')
    }
  })

  it('12b. calls generateObject with system + user messages', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN })

    await client.generate(BASE_OPTS)

    expect(mockGenerateObject).toHaveBeenCalledOnce()
    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const roles = callArgs.messages.map((m) => m.role)
    expect(roles).toContain('system')
    expect(roles).toContain('user')
  })

  it('12c. passes RouterPlanSchema as the schema to generateObject', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN })

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
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN })
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
    mockGenerateObject.mockResolvedValueOnce({ object: VALID_PLAN })
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
})
