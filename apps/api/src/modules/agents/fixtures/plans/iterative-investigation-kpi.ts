/**
 * Fixture: iterative plan for "why did my KPI regress?" investigation.
 *
 * Used in integration tests to exercise the iterative supervisor loop
 * with a realistic KPI investigation scenario.
 *
 * Scorer: kpi-answer-shape-deterministic (Plan 12 Task 7 fixture)
 * Max iterations: 5 (global-chat surface cap: 10)
 */

import type { IterativePlan } from '../../domain/value-objects/router-plan-schema'

export const iterativeInvestigationKpiPlan: IterativePlan = {
  topology: 'iterative',
  intent_slug: 'goals.kpi',
  flow_id: '01900000-0000-7fff-8000-000000000f01',
  initialDirective: {
    sub_agent_key: 'goals.analyst',
    input: {
      question: 'why did my KPI regress?',
      kpi_id: 'revenue-monthly',
      period: 'last-30-days',
    },
    reason: 'User asked about KPI regression — start with goals.analyst to identify root cause',
  },
  completionCriteria: {
    scorerIds: ['kpi-answer-shape-deterministic'],
    strategy: 'all',
    maxIterations: 5,
    hintToRouter:
      'KPI regression root cause identified with at least one supporting data point. ' +
      'The answer should name the metric, the observed change, and the primary driver.',
  },
}
