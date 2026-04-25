/**
 * synthesizer-adapter.spec.ts — Plan 12 Task 7
 *
 * Unit tests for SynthesizerAdapter.
 *
 * Tests:
 *   1. synthesize() returns a SynthesizerOutput with the expected shape
 *   2. Confidence is 'med' when no contradiction (intentional cap — see adapter comment)
 *   3. Confidence is 'low' when sub-agents carry different semantics (contradiction detected)
 */

import { describe, it, expect } from 'vitest'
import { SynthesizerAdapter } from './synthesizer-adapter'
import type { SynthesizerOpts, SubAgentOutput } from './phase-executor-contracts'
import type { PhaseExecutorTurnState } from './phase-executor-contracts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  inputCachedRead: 0,
  inputCachedWrite: 0,
  outputReasoning: 0,
  costUsd: 0,
}

function makeTurnState(): PhaseExecutorTurnState {
  return {
    traceId: 'trace-synth-spec',
    tenantId: 'tenant-001',
    userId: 'user-001',
    conversationId: 'conv-001',
    sessionId: 'sess-001',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
  }
}

function makeCompletedOutput(semantics: string, summary: string): SubAgentOutput {
  return {
    kind: 'completed',
    summary,
    semantics,
    confidence: 'high',
    sourceToolProvenance: [],
    structured: {},
    drafts: [],
    circuitBreakerState: {},
    usageTotals: ZERO_USAGE,
  }
}

function makeOpts(
  phase1Outputs: Map<string, SubAgentOutput>,
  phase2Outputs = new Map<string, SubAgentOutput>(),
): SynthesizerOpts {
  return {
    directive: {
      topology: 'bounded',
      intent_slug: 'goals.kpi',
      flow_id: '00000000-0000-0000-0000-000000000001',
      phase1: [],
      phase2: [],
    },
    phase1Outputs,
    phase2Outputs,
    userUtterance: 'Why did my KPI drop?',
    abortSignal: new AbortController().signal,
    turnState: makeTurnState(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SynthesizerAdapter', () => {
  it('1. returns a SynthesizerOutput with the expected shape', async () => {
    const adapter = new SynthesizerAdapter()
    const phase1Outputs = new Map([
      ['iter-1-goals.analyst', makeCompletedOutput('kpi-regression', 'Revenue down 12%')],
    ])
    const opts = makeOpts(phase1Outputs)

    const output = await adapter.synthesize(opts)

    expect(output).toMatchObject({
      shape: 'narrative',
      citations: expect.any(Array),
      turnEndedReason: 'completed',
    })
    expect(output.confidence).toBeDefined()
    expect(typeof output.content).toBe('string')
  })

  it('2. confidence is "med" when no contradiction across sub-agents', async () => {
    // Intentional: synthesized confidence caps at 'med' conservatively.
    // The adapter cannot assert the certainty of a single focused sub-agent run
    // when merging outputs from multiple sources. See synthesizer-adapter.ts comment.
    const adapter = new SynthesizerAdapter()
    const phase1Outputs = new Map([
      ['iter-1-goals.analyst', makeCompletedOutput('kpi-regression', 'Revenue down 12%')],
      ['iter-2-goals.analyst', makeCompletedOutput('kpi-regression', 'Root cause: churn spike')],
    ])
    const opts = makeOpts(phase1Outputs)

    const output = await adapter.synthesize(opts)

    expect(output.confidence).toBe('med')
  })

  it('3. confidence is "low" when sub-agents carry different semantics (contradiction)', async () => {
    const adapter = new SynthesizerAdapter()
    const phase1Outputs = new Map([
      ['iter-1-goals.analyst', makeCompletedOutput('kpi-regression', 'Revenue down 12%')],
      // Different semantics → contradiction detected → confidence drops to 'low'
      [
        'iter-2-goals.benchmarker',
        makeCompletedOutput('benchmark-comparison', 'Industry average down 5%'),
      ],
    ])
    const opts = makeOpts(phase1Outputs)

    const output = await adapter.synthesize(opts)

    expect(output.confidence).toBe('low')
  })
})
