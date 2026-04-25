/**
 * Fixture: 10 IterationRecords where the scorer never passes.
 *
 * Represents the max-iterations-reached scenario in the KPI investigation:
 * the supervisor ran 10 iterations but never found a satisfactory answer.
 * The turn exits with { kind: 'partial', reason: 'limit_reached' }.
 *
 * Each record reflects a completed sub-agent run with scorer result: passed=false.
 * The progressively degrading confidence (high → med → low) models real behaviour
 * where repeated failures signal decreasing confidence in the sub-agent output.
 */

import type { IterationRecord } from '../../application/services/phase-executor-contracts'

const BASE_TURN_ID = '01900000-0000-7fff-8000-000000000e01'

function makeFailedIterationRecord(n: number): IterationRecord {
  const confidence = n <= 3 ? 'high' : n <= 6 ? 'med' : 'low'
  return {
    iterationNumber: n,
    subAgentKey: 'goals.analyst',
    directive: {
      sub_agent_key: 'goals.analyst',
      input: { attempt: n, question: 'why did my KPI regress?' },
      reason:
        n === 1
          ? 'initial dispatch'
          : `retry attempt ${n} — previous iteration did not find root cause`,
    },
    output: {
      kind: 'completed',
      summary: `Iteration ${n}: still investigating KPI regression, no root cause found yet`,
      semantics: 'kpi-regression-analysis',
      confidence,
      sourceToolProvenance: [],
      structured: { kpiAnswered: false, attempt: n },
      circuitBreakerState: {},
      usageTotals: {
        inputTokens: 200 + n * 10,
        outputTokens: 100 + n * 5,
        inputCachedRead: 0,
        inputCachedWrite: 0,
        outputReasoning: 0,
        costUsd: 0.02 + n * 0.001,
      },
    },
    scorerResults: [
      {
        score: 0,
        passed: false,
        reason: `kpiAnswered=false — expected true (iteration ${n})`,
      },
    ],
    isComplete: false,
  }
}

/**
 * 10 iteration records representing a turn that hit the maximum iteration cap
 * without the completion scorer ever passing.
 *
 * The associated `turnId` is exported for cross-referencing in tests.
 */
export const MAX_ITERATIONS_TURN_ID = BASE_TURN_ID

export const maxIterationsReachedFixture: IterationRecord[] = Array.from({ length: 10 }, (_, i) =>
  makeFailedIterationRecord(i + 1),
)
