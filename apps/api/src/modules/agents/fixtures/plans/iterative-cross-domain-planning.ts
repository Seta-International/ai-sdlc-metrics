/**
 * Fixture: iterative plan for cross-domain planning.
 *
 * Demonstrates a multi-domain iterative plan that spans people + projects +
 * goals modules. Used to verify that the supervisor loop correctly coordinates
 * across domain boundaries via sequential sub-agent directives.
 *
 * Scorers: both answer-completeness-deterministic AND cross-domain-coverage-deterministic
 * must pass (strategy: 'all') for the loop to exit successfully.
 */

import type { IterativePlan } from '../../domain/value-objects/router-plan-schema'

export const iterativeCrossDomainPlanningPlan: IterativePlan = {
  topology: 'iterative',
  intent_slug: 'planner.cross-domain',
  flow_id: '01900000-0000-7fff-8000-000000000f02',
  initialDirective: {
    sub_agent_key: 'people.org-chart',
    input: {
      context: 'Plan Q3 headcount growth across engineering and product',
    },
    reason:
      'Cross-domain planning starts with org-chart to understand current headcount before expanding to goals and projects',
  },
  completionCriteria: {
    scorerIds: ['answer-completeness-deterministic', 'cross-domain-coverage-deterministic'],
    strategy: 'all',
    maxIterations: 8,
    hintToRouter:
      'Planning output must cover headcount from people module, active project assignments from projects module, ' +
      'and OKR alignment from goals module. All three domains must be represented in the answer.',
  },
}
