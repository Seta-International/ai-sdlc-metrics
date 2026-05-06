# R-13: Exponential Backoff for Provider Retry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc 200 ms single-retry in `ToolGateway` with a proper 2-attempt exponential backoff + jitter utility (`withProviderRetry`) wired into all three LLM clients, with SDK-level retries disabled.

**Architecture:** New `withProviderRetry<T>(fn, opts)` in `infrastructure/adapters/provider-retry.ts` wraps async LLM calls with up to 2 total attempts (SAD NFR cap), exponential backoff + jitter, and `Retry-After` header honoring via the existing `OpenAiVendorErrorExtractor`. Applied to `RouterLlmClient` and `SubAgentLlmClient` (full wrap); `SynthesizerLlmClient` gets `maxRetries: 0` only — streaming output cannot be replayed mid-stream. The existing ad-hoc single-retry block in `ToolGateway` (~lines 840–849) is removed: tools call domain code, not LLM providers, so retrying there is wrong.

**Tech Stack:** TypeScript, `openai-vendor-error-extractor.ts`, `VendorError`, Vercel AI SDK (`generateObject` / `generateText` / `streamObject`), `createOpenAI`

---

## File Map

| Action | Path                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| Create | `apps/api/src/modules/agents/infrastructure/adapters/provider-retry.ts`                |
| Create | `apps/api/src/modules/agents/infrastructure/adapters/provider-retry.spec.ts`           |
| Modify | `apps/api/src/modules/agents/infrastructure/adapters/openai-vendor-error-extractor.ts` |
| Modify | `apps/api/src/modules/agents/infrastructure/llm/router-llm-client.ts`                  |
| Modify | `apps/api/src/modules/agents/infrastructure/llm/sub-agent-llm-client.ts`               |
| Modify | `apps/api/src/modules/agents/infrastructure/llm/synthesizer-llm-client.ts`             |
| Modify | `apps/api/src/modules/agents/application/services/tool-gateway.ts`                     |

---

## Task 1: Add 504 to VendorErrorExtractor

The extractor handles 500/502/503 as `vendor_server_error` but misses 504 (Gateway Timeout), which the SAD lists as retryable.

- [ ] **Step 1.1: Locate and patch the server-error block**

  In `apps/api/src/modules/agents/infrastructure/adapters/openai-vendor-error-extractor.ts`, find:

  ```typescript
  if (status === 500 || status === 502 || status === 503) {
    return { class: 'vendor_server_error', vendorMessage }
  }
  ```

  Replace with:

  ```typescript
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { class: 'vendor_server_error', vendorMessage }
  }
  ```

- [ ] **Step 1.2: Run existing extractor tests to confirm no regression**

  ```bash
  cd apps/api && bun run test:unit -- --reporter=verbose 2>&1 | grep -E "vendor-error|VendorError|extractor|PASS|FAIL" | head -20
  ```

  Expected: all extractor tests pass.

- [ ] **Step 1.3: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/adapters/openai-vendor-error-extractor.ts
  git commit -m "fix(agents): include HTTP 504 in vendor_server_error retryable class"
  ```

---

## Task 2: Write Failing Tests for `withProviderRetry`

- [ ] **Step 2.1: Create the spec file**

  Create `apps/api/src/modules/agents/infrastructure/adapters/provider-retry.spec.ts`:

  ```typescript
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
  import { withProviderRetry, type RetryOpts } from './provider-retry'

  function makeRateLimitError(retryAfterSec?: number): Error & Record<string, unknown> {
    const err = new Error('rate limit exceeded') as Error & Record<string, unknown>
    err['status'] = 429
    if (retryAfterSec !== undefined) {
      err['headers'] = { 'retry-after': String(retryAfterSec) }
    }
    return err
  }

  function makeAuthError(): Error & Record<string, unknown> {
    const err = new Error('unauthorized') as Error & Record<string, unknown>
    err['status'] = 401
    return err
  }

  function makeServerError(): Error & Record<string, unknown> {
    const err = new Error('internal server error') as Error & Record<string, unknown>
    err['status'] = 500
    return err
  }

  describe('withProviderRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns result immediately when first attempt succeeds', async () => {
      const fn = vi.fn().mockResolvedValue('ok')
      const result = await withProviderRetry(fn)
      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries once on 429 and succeeds on second attempt', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(makeRateLimitError())
        .mockResolvedValue('ok-after-retry')
      const promise = withProviderRetry(fn, { baseDelayMs: 10, jitterMs: 0 })
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result).toBe('ok-after-retry')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('honours retryAfterMs from Retry-After header', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(makeRateLimitError(3)) // 3 seconds
        .mockResolvedValue('done')
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const promise = withProviderRetry(fn)
      await vi.runAllTimersAsync()
      await promise
      const delays = setTimeoutSpy.mock.calls.map((c) => c[1] as number)
      expect(delays.some((d) => d >= 3000 && d <= 32_000)).toBe(true)
    })

    it('does NOT issue a third attempt when maxAttempts=2 and both fail', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(makeRateLimitError())
        .mockRejectedValueOnce(makeRateLimitError())
      const opts: RetryOpts = { maxAttempts: 2, baseDelayMs: 10, jitterMs: 0 }
      const promise = withProviderRetry(fn, opts)
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toThrow('rate limit exceeded')
      expect(fn).toHaveBeenCalledTimes(2) // 1 original + 1 retry = 2 total; no third
    })

    it('does NOT retry on 401 (non-retryable)', async () => {
      const fn = vi.fn().mockRejectedValue(makeAuthError())
      await expect(withProviderRetry(fn)).rejects.toThrow('unauthorized')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries on 500 server error', async () => {
      const fn = vi.fn().mockRejectedValueOnce(makeServerError()).mockResolvedValue('recovered')
      const promise = withProviderRetry(fn, { baseDelayMs: 10, jitterMs: 0 })
      await vi.runAllTimersAsync()
      expect(await promise).toBe('recovered')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
  ```

- [ ] **Step 2.2: Run to confirm fail (file does not exist yet)**

  ```bash
  cd apps/api && bun run test:unit -- provider-retry.spec 2>&1 | tail -5
  ```

  Expected: `Cannot find module './provider-retry'` or import error.

---

## Task 3: Implement `withProviderRetry`

- [ ] **Step 3.1: Create `provider-retry.ts`**

  Create `apps/api/src/modules/agents/infrastructure/adapters/provider-retry.ts`:

  ```typescript
  import { OpenAiVendorErrorExtractor } from './openai-vendor-error-extractor'
  import type { VendorError } from '../../domain/cost/cost-types'

  export interface RetryOpts {
    /** Base delay in ms before first retry. Default: 500. */
    baseDelayMs?: number
    /** Exponential multiplier. Default: 2. */
    multiplier?: number
    /** Random jitter upper bound in ms. Default: 200. */
    jitterMs?: number
    /**
     * Total number of attempts including the original call. Default: 2.
     * SAD NFR §3.2 cap: do not raise above 2 without explicit approval.
     */
    maxAttempts?: number
  }

  const MAX_DELAY_MS = 32_000
  const extractor = new OpenAiVendorErrorExtractor()

  function isRetryable(e: VendorError): boolean {
    return (
      e.class === 'vendor_rate_limit' ||
      e.class === 'vendor_server_error' ||
      e.class === 'vendor_overload' ||
      e.class === 'vendor_timeout'
    )
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Wraps an async provider call with SAD-capped exponential backoff retry.
   *
   * - maxAttempts defaults to 2 (1 original + 1 retry). Do not raise without approval.
   * - SDK callers must pass maxRetries: 0 so the SDK never retries independently.
   * - Non-retryable errors (401 auth, etc.) are re-thrown immediately on first failure.
   * - Retry-After headers are honoured, capped at 32 s.
   */
  export async function withProviderRetry<T>(
    fn: () => Promise<T>,
    opts: RetryOpts = {},
  ): Promise<T> {
    const { baseDelayMs = 500, multiplier = 2, jitterMs = 200, maxAttempts = 2 } = opts

    let lastError: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err

        if (attempt >= maxAttempts - 1) throw err

        const vendorError = extractor.extract(err)
        if (!vendorError || !isRetryable(vendorError)) throw err

        let delayMs: number
        if (vendorError.retryAfterMs !== undefined) {
          delayMs = Math.min(vendorError.retryAfterMs, MAX_DELAY_MS)
        } else {
          const exp = baseDelayMs * Math.pow(multiplier, attempt)
          delayMs = Math.min(exp + Math.floor(Math.random() * jitterMs), MAX_DELAY_MS)
        }

        await sleep(delayMs)
      }
    }

    throw lastError
  }
  ```

- [ ] **Step 3.2: Run tests — expect all 6 to pass**

  ```bash
  cd apps/api && bun run test:unit -- provider-retry.spec 2>&1 | tail -15
  ```

- [ ] **Step 3.3: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/adapters/provider-retry.ts \
          apps/api/src/modules/agents/infrastructure/adapters/provider-retry.spec.ts
  git commit -m "feat(agents/r13): add withProviderRetry — SAD NFR §3.2 exponential backoff"
  ```

---

## Task 4: Wrap `RouterLlmClient.generate()`

- [ ] **Step 4.1: Add import to `router-llm-client.ts`**

  In `apps/api/src/modules/agents/infrastructure/llm/router-llm-client.ts`, add after existing imports:

  ```typescript
  import { withProviderRetry } from '../adapters/provider-retry'
  ```

- [ ] **Step 4.2: Disable SDK retries in `_resolveModel`**

  In `_resolveModel()`, `case 'openai':`, change:

  ```typescript
  const openaiClient = createOpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
  })
  ```

  To:

  ```typescript
  const openaiClient = createOpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
    maxRetries: 0,
  })
  ```

- [ ] **Step 4.3: Wrap `generateObject` call in `generate()`**

  Inside the `try` block of `generate()`, find:

  ```typescript
  const result = await generateObject({
    model: languageModel,
    schema: RouterPlanSchema,
    system: systemPrompt,
    messages: [
      { role: 'system', content: developerMessage },
      { role: 'user', content: userMessage },
    ],
    abortSignal: controller.signal,
  })
  ```

  Replace with:

  ```typescript
  const result = await withProviderRetry(
    () =>
      generateObject({
        model: languageModel,
        schema: RouterPlanSchema,
        system: systemPrompt,
        messages: [
          { role: 'system', content: developerMessage },
          { role: 'user', content: userMessage },
        ],
        maxRetries: 0,
        abortSignal: controller.signal,
      }),
    { maxAttempts: 2 },
  )
  ```

- [ ] **Step 4.4: Run router-llm-client tests**

  ```bash
  cd apps/api && bun run test:unit -- router-llm-client 2>&1 | tail -10
  ```

  Expected: all tests pass.

- [ ] **Step 4.5: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/llm/router-llm-client.ts
  git commit -m "feat(agents/r13): wrap RouterLlmClient.generate with withProviderRetry"
  ```

---

## Task 5: Wrap `SubAgentLlmClient.runWithTools()`

- [ ] **Step 5.1: Add import to `sub-agent-llm-client.ts`**

  ```typescript
  import { withProviderRetry } from '../adapters/provider-retry'
  ```

- [ ] **Step 5.2: Disable SDK retries in `resolveModel`**

  ```typescript
  case 'openai': {
    const client = createOpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
      maxRetries: 0,
    })
    return client(choice.model)
  }
  ```

- [ ] **Step 5.3: Wrap the entire generate block in `runWithTools`**

  Replace the body of `OpenAiSubAgentLlmClient.runWithTools()` with:

  ```typescript
  async runWithTools(opts: SubAgentLlmClientOpts): Promise<SubAgentLlmClientResult> {
    const model = resolveModel(opts.model)

    return withProviderRetry(
      async () => {
        const result = await generateText({
          model,
          system: opts.system,
          prompt: opts.userMessage,
          tools: opts.tools,
          stopWhen: stepCountIs(opts.maxIterations),
          maxRetries: 0,
          abortSignal: opts.abortSignal,
          experimental_output: Output.object({ schema: opts.outputSchema }),
        } as Parameters<typeof generateText>[0])

        let rawStructured: unknown = (result as unknown as { experimental_output?: unknown })
          .experimental_output
        if (rawStructured === undefined) {
          const followup = await generateObject({
            model,
            schema: opts.outputSchema,
            prompt: result.text,
            maxRetries: 0,
            abortSignal: opts.abortSignal,
          })
          rawStructured = followup.object
        }

        return {
          rawStructured,
          text: result.text,
          steps: result.steps,
          usage: mapLanguageModelUsage(result.usage as unknown as LanguageModelUsageLike),
          finishReason: result.finishReason as SubAgentLlmClientResult['finishReason'],
        }
      },
      { maxAttempts: 2 },
    )
  }
  ```

- [ ] **Step 5.4: Run sub-agent tests**

  ```bash
  cd apps/api && bun run test:unit -- sub-agent-llm-client 2>&1 | tail -10
  ```

- [ ] **Step 5.5: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/llm/sub-agent-llm-client.ts
  git commit -m "feat(agents/r13): wrap SubAgentLlmClient.runWithTools with withProviderRetry"
  ```

---

## Task 6: Disable SDK Retries in `SynthesizerLlmClient`

`streamObject` returns synchronously — errors surface via the stream's async iterable, so full retry requires re-calling `synthesize()` from the consumer (deferred). For Phase 1, disable SDK-internal retries only.

- [ ] **Step 6.1: Add `maxRetries: 0` to `createOpenAI` in `resolveModel`**

  In `apps/api/src/modules/agents/infrastructure/llm/synthesizer-llm-client.ts`, `resolveModel()`, `case 'openai':`:

  ```typescript
  const client = createOpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
    maxRetries: 0,
  })
  ```

- [ ] **Step 6.2: Add `maxRetries: 0` to the `streamObject` call**

  In `OpenAiSynthesizerLlmClient.synthesize()`, locate the `streamObject({...})` call and add `maxRetries: 0` as one of the options:

  ```typescript
  const stream = streamObject({
    model,
    schema: opts.schema as never,
    system: opts.system,
    // ... existing options ...
    maxRetries: 0,
  } as Parameters<typeof streamObject>[0])
  ```

- [ ] **Step 6.3: Run synthesizer tests**

  ```bash
  cd apps/api && bun run test:unit -- synthesizer-llm-client 2>&1 | tail -10
  ```

- [ ] **Step 6.4: Commit**

  ```bash
  git add apps/api/src/modules/agents/infrastructure/llm/synthesizer-llm-client.ts
  git commit -m "feat(agents/r13): disable SDK-internal retries in SynthesizerLlmClient"
  ```

---

## Task 7: Remove Transient Retry from `ToolGateway`

Tools call domain code — not LLM APIs — so the retry there is misplaced and never triggers a provider retry. Remove it so provider retry lives only in the LLM client layer.

- [ ] **Step 7.1: Find the block in `apps/api/src/modules/agents/application/services/tool-gateway.ts`**

  Search for the comment `Single transient retry`. The block looks like:

  ```typescript
  // Single transient retry (200 ms + 0-100 ms jitter)
  if (
    isTripwireVariant(invokeResult) &&
    invokeResult.variant === 'transient_infra_error' &&
    invokeResult.disposition === 'retry'
  ) {
    retryCount = 1
    await sleep(200 + Math.floor(Math.random() * 100))
    invokeResult = await invokeStep()
  }
  ```

- [ ] **Step 7.2: Delete the retry block**

  Remove the entire `if` block above (including the comment). Keep the `let invokeResult = await invokeStep()` line immediately before it. The `retryCount` variable declaration remains — it is still used in audit/observability downstream (stays at 0 for transient errors; that is correct).

  Check whether the local `sleep` helper (if defined in this file) is still used elsewhere. If it is only referenced by the deleted block, remove it too. If used elsewhere, keep it.

- [ ] **Step 7.3: Run tool-gateway tests**

  ```bash
  cd apps/api && bun run test:unit -- tool-gateway 2>&1 | tail -15
  ```

  If any test was asserting a single-retry behaviour for `transient_infra_error`, update that test to expect no retry (the first failure surfaces immediately).

- [ ] **Step 7.4: Run full API unit suite**

  ```bash
  cd apps/api && bun run test:unit 2>&1 | tail -5
  ```

  Expected: green.

- [ ] **Step 7.5: Commit**

  ```bash
  git add apps/api/src/modules/agents/application/services/tool-gateway.ts
  git commit -m "refactor(agents/r13): remove ad-hoc transient retry from ToolGateway — provider retry lives in LLM clients (SAD §3.2)"
  ```

---

## Self-Review

- `withProviderRetry` never exceeds `maxAttempts` total calls — the guard `attempt >= maxAttempts - 1` ensures the last attempt throws immediately.
- `maxRetries: 0` appears in both `createOpenAI()` and each SDK call in all three LLM clients.
- `504` is included in the extractor's `vendor_server_error` branch.
- `retryCount` variable in `tool-gateway.ts` is NOT removed — only the `if` block assigning it to `1` is gone.
- Full unit suite passes: `cd apps/api && bun run test:unit`.
