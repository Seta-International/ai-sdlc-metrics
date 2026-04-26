/**
 * react-loop-driver tests — Plan 17 PR 2 Task 5.
 *
 * Validates that `runReactLoop`:
 *   - Forwards happy-path SubAgentLlmClient results into a ReactLoopDriverResult
 *     whose signals reflect BridgeAccumulator state.
 *   - Sets `signals.ceilingHit = true` when the LLM finishReason is 'tool-calls'.
 *   - Catches HardTripwireError thrown by the LLM client and surfaces it on the
 *     `hardTripwire` field with ZERO_USAGE.
 *   - Catches AbortError (or aborted signal) and returns `aborted: true`.
 *   - Propagates `taintFlippedDuringRun` from the accumulator.
 *   - Re-throws unexpected errors (e.g. TypeError) without swallowing them.
 */

import { describe, it, expect, vi } from 'vitest'
import * as z from 'zod'
import {
  newAccumulator,
  HardTripwireError,
  type BridgeAccumulator,
} from '../../infrastructure/tool-gateway/tool-gateway-bridge'
import type {
  SubAgentLlmClient,
  SubAgentLlmClientResult,
} from '../../infrastructure/llm/sub-agent-llm-client'
import type { Tripwire } from '../../infrastructure/guards/tripwire'
import type { ModelChoice } from '../../domain/services/sub-agent-types'
import { runReactLoop } from './react-loop-driver'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODEL: ModelChoice = { provider: 'openai', model: 'gpt-5.4-nano' }

const SCHEMA = z.object({ ok: z.boolean() })

function makeResult(overrides: Partial<SubAgentLlmClientResult> = {}): SubAgentLlmClientResult {
  return {
    rawStructured: { ok: true },
    text: 'done',
    steps: [],
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0,
    },
    finishReason: 'stop',
    ...overrides,
  }
}

function makeClient(impl: SubAgentLlmClient['runWithTools']): SubAgentLlmClient {
  return { runWithTools: vi.fn(impl) }
}

function baseOpts(
  client: SubAgentLlmClient,
  accumulator: BridgeAccumulator = newAccumulator(),
  abortSignal: AbortSignal = new AbortController().signal,
) {
  return {
    llmClient: client,
    model: MODEL,
    system: 'sys',
    userMessage: 'hi',
    tools: {},
    outputSchema: SCHEMA,
    maxIterations: 4,
    abortSignal,
    accumulator,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runReactLoop', () => {
  it('returns rawStructured + non-zero usage and reflects accumulator.toolResultCount in signals', async () => {
    const acc = newAccumulator()
    acc.toolResultCount = 3
    acc.toolFailureCount = 1
    acc.retryCount = 1

    const client = makeClient(async () => makeResult())
    const result = await runReactLoop(baseOpts(client, acc))

    expect(result.rawStructured).toEqual({ ok: true })
    expect(result.text).toBe('done')
    expect(result.usageTotals.inputTokens).toBe(10)
    expect(result.usageTotals.outputTokens).toBe(5)
    expect(result.signals.toolResultCount).toBe(3)
    expect(result.signals.toolFailureCount).toBe(1)
    expect(result.signals.retryCount).toBe(1)
    expect(result.signals.ceilingHit).toBe(false)
    expect(result.aborted).toBe(false)
    expect(result.hardTripwire).toBeUndefined()
  })

  it('sets ceilingHit when finishReason is tool-calls', async () => {
    const client = makeClient(async () => makeResult({ finishReason: 'tool-calls' }))
    const result = await runReactLoop(baseOpts(client))
    expect(result.signals.ceilingHit).toBe(true)
  })

  it('surfaces HardTripwireError on the hardTripwire field with ZERO_USAGE', async () => {
    const tw: Tripwire = {
      kind: 'tripwire',
      variant: 'infra_error',
      disposition: 'abort',
      context: {},
    }
    const client = makeClient(async () => {
      throw new HardTripwireError(tw, 't1')
    })

    const result = await runReactLoop(baseOpts(client))

    expect(result.hardTripwire).toBeDefined()
    expect(result.hardTripwire?.toolName).toBe('t1')
    expect(result.hardTripwire?.tripwire).toBe(tw)
    expect(result.aborted).toBe(false)
    expect(result.usageTotals.inputTokens).toBe(0)
    expect(result.usageTotals.outputTokens).toBe(0)
    expect(result.signals.ceilingHit).toBe(false)
  })

  it('returns aborted=true when client throws AbortError', async () => {
    const client = makeClient(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    })

    const result = await runReactLoop(baseOpts(client))

    expect(result.aborted).toBe(true)
    expect(result.hardTripwire).toBeUndefined()
    expect(result.usageTotals.inputTokens).toBe(0)
    expect(result.signals.ceilingHit).toBe(false)
  })

  it('propagates accumulator.taintFlippedDuringRun into signals', async () => {
    const acc = newAccumulator()
    acc.taintFlippedDuringRun = true
    const client = makeClient(async () => makeResult())

    const result = await runReactLoop(baseOpts(client, acc))

    expect(result.signals.taintFlippedDuringRun).toBe(true)
  })

  it('re-throws unexpected errors (e.g. TypeError) without swallowing', async () => {
    const client = makeClient(async () => {
      throw new TypeError('boom')
    })

    await expect(runReactLoop(baseOpts(client))).rejects.toBeInstanceOf(TypeError)
  })
})
