/**
 * Fixture: iterative plan that references an LLM-judge scorer.
 *
 * This fixture is used in tests that verify ScorerRegistry correctly rejects
 * LLM-judge scorers when registered with role 'iterative-topology-exit-gate'
 * (Plan 12 §3.1 invariant 4, R-10.32).
 *
 * The plan itself is structurally valid; the test must attempt to register
 * an LLM-judge scorer with the 'iterative-topology-exit-gate' role and
 * confirm that ScorerRegistrationError is thrown.
 *
 * NOTE: This plan MUST NOT be dispatched to IterativeOrchestrator with a
 * live LLM-judge scorer registered — CompletionScorerRunner will throw hard
 * per Plan 12 §3.1 invariant 4 if it encounters a non-deterministic scorer.
 */

import type { IterativePlan } from '../../domain/value-objects/router-plan-schema'

export const iterativeWithLlmJudgeRejectedPlan: IterativePlan = {
  topology: 'iterative',
  intent_slug: 'hiring.candidate-evaluation',
  flow_id: '01900000-0000-7fff-8000-000000000f03',
  initialDirective: {
    sub_agent_key: 'hiring.pipeline',
    input: {
      role: 'Senior Engineer',
      pipeline_stage: 'final-interview',
    },
    reason: 'Evaluate candidate quality against hiring bar — requires LLM-judge scorer at gate',
  },
  completionCriteria: {
    // This scorer ID corresponds to a hypothetical LLM-judge scorer.
    // Attempting to register it with role='iterative-topology-exit-gate'
    // MUST throw ScorerRegistrationError (Plan 12 §3.1 invariant 4).
    scorerIds: ['llm-judge-candidate-quality'],
    strategy: 'all',
    maxIterations: 3,
    hintToRouter:
      'Candidate quality has been evaluated across all dimensions: technical, cultural, and scope. ' +
      'LLM judge provides a qualitative assessment of hire/no-hire recommendation.',
  },
}
