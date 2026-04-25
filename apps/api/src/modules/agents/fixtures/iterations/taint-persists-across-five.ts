/**
 * Fixture: 5 IterationRecords where iteration 1 taints the turn.
 *
 * Models the taint-persistence scenario:
 *   - Iteration 1: sub-agent accesses user-authored free text → taint flipped to true
 *   - Iterations 2–5: taint_at_start=true in the SSE payload (the iteration was started
 *     AFTER the taint was set by iteration 1)
 *
 * The taint flag is carried on PhaseExecutorTurnState.tainted.value (mutable reference).
 * This fixture captures the per-iteration record state AFTER execution to verify that
 * the taint provenance is preserved in the IterationRecord shape.
 *
 * NOTE: The IterationRecord type does not itself carry taintAtStart — that field lives on
 * AgentIterationRow (DB schema, Task 1). The SSE payload carries it per-event. This fixture
 * represents the logical state for test assertions against SSE events + DB rows.
 */

import type { IterationRecord } from '../../application/services/phase-executor-contracts'

function makeIterationRecord(
  n: number,
  opts: {
    kpiAnswered?: boolean
    taintFlippedDuringRun?: boolean
    confidence?: 'high' | 'med' | 'low'
  } = {},
): IterationRecord {
  const { kpiAnswered = false, confidence = 'med' } = opts

  return {
    iterationNumber: n,
    subAgentKey: 'goals.analyst',
    directive: {
      sub_agent_key: 'goals.analyst',
      input: { attempt: n, question: 'cross-domain planning' },
      reason: n === 1 ? 'initial dispatch' : `iteration ${n} follow-up`,
    },
    output: {
      kind: 'completed',
      summary:
        n === 1
          ? 'Loaded employee profiles (taint: user-authored comments read into context)'
          : `Iteration ${n}: ${kpiAnswered ? 'planning complete' : 'still gathering data'}`,
      semantics: 'cross-domain-planning',
      confidence,
      sourceToolProvenance:
        n === 1
          ? [
              {
                toolName: 'people.getEmployeeProfile',
                args: { userId: 'user-001' },
                result: {
                  name: 'Alice',
                  // user-authored free text that triggers taint detection
                  notes: 'Please approve my leave request as soon as possible',
                },
                iteration: 1,
                durationMs: 120,
              },
            ]
          : [],
      structured: { kpiAnswered, domain: 'cross-domain', iteration: n },
      circuitBreakerState: {},
      usageTotals: {
        inputTokens: 250 + n * 15,
        outputTokens: 120 + n * 8,
        inputCachedRead: 0,
        inputCachedWrite: 0,
        outputReasoning: 0,
        costUsd: 0.025 + n * 0.002,
      },
    },
    scorerResults: [
      {
        score: kpiAnswered ? 1 : 0,
        passed: kpiAnswered,
        reason: kpiAnswered ? 'planning complete' : 'still in progress',
      },
    ],
    isComplete: kpiAnswered,
  }
}

/**
 * 5 iteration records where iteration 1 triggered taint detection
 * (people.getEmployeeProfile returned user-authored free text).
 *
 * Taint state per iteration:
 *   - iter 1: taint_at_start=false (taint was NOT set before iter 1 began)
 *   - iter 2–5: taint_at_start=true (taint was set during iter 1)
 *
 * The final iteration (5) passes the scorer → the turn exits as 'synthesized'.
 */
export const taintPersistsAcrossFiveFixture: IterationRecord[] = [
  makeIterationRecord(1, { taintFlippedDuringRun: true, confidence: 'high' }),
  makeIterationRecord(2, { confidence: 'med' }),
  makeIterationRecord(3, { confidence: 'med' }),
  makeIterationRecord(4, { confidence: 'med' }),
  makeIterationRecord(5, { kpiAnswered: true, confidence: 'high' }),
]

/**
 * Expected taint_at_start values for each iteration.
 * Maps iterationNumber → taint_at_start (as reported in SSE iteration.started event).
 *
 * Iteration 1 starts before taint is set → false.
 * Iterations 2–5 start after taint is set → true.
 */
export const expectedTaintAtStart: Record<number, boolean> = {
  1: false,
  2: true,
  3: true,
  4: true,
  5: true,
}
