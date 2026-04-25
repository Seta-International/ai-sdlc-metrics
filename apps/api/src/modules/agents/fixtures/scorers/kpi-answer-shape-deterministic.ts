/**
 * Fixture: deterministic scorer for KPI investigation plans.
 *
 * Passes when SubAgentOutput.structured contains { kpiAnswered: true }.
 * Used in integration tests to verify the iterative supervisor loop exits
 * correctly when the KPI investigation produces a complete answer.
 *
 * Registration: scope='test', kind='deterministic'. Never requires
 * metaEvalAgreement. Safe to register with role='iterative-topology-exit-gate'.
 */

import type { SetaScorer } from '../../domain/scorer-types'
import type { SubAgentOutput } from '../../application/services/phase-executor-contracts'

export const kpiAnswerShapeDeterministicScorer: SetaScorer<SubAgentOutput, SubAgentOutput> = {
  id: 'kpi-answer-shape-deterministic',
  name: 'KPI Answer Shape (deterministic)',
  kind: 'deterministic',
  scope: 'test',
  definitionSource: 'code',

  async run(ctx) {
    const output = ctx.output
    const structured = output.structured as Record<string, unknown> | null | undefined

    // Pass only when the sub-agent explicitly signals that the KPI question is answered
    if (!structured || typeof structured !== 'object') {
      return {
        score: 0,
        passed: false,
        reason: 'structured output is missing or not an object',
      }
    }

    const kpiAnswered = structured['kpiAnswered']
    if (kpiAnswered !== true) {
      return {
        score: 0,
        passed: false,
        reason: `kpiAnswered=${String(kpiAnswered)} — expected true`,
      }
    }

    // Additional shape check: summary must be non-empty
    if (!output.summary || output.summary.trim().length === 0) {
      return {
        score: 0,
        passed: false,
        reason: 'summary is empty — answer lacks human-readable explanation',
      }
    }

    return {
      score: 1,
      passed: true,
      reason: 'KPI answer shape is valid: kpiAnswered=true and summary is non-empty',
    }
  },
}
