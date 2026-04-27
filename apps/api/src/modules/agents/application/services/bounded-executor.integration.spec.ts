/**
 * BoundedExecutor — integration spec (Plan 18 Task 10).
 *
 * Scope decision per Plan 18 Task 10 implementer-note:
 *   The unit tests in `bounded-executor.spec.ts` (Task 5 + Task 9 additions)
 *   exhaustively cover the executor's logic across 12 cases — sequential
 *   phase-1 dispatch, partial-answer gating (suppress vs surface), `phase.started`
 *   emission, mid-loop abort, phase-2 dispatch, `phaseContextNote` propagation
 *   from circuit-breaker state, `outputs` map composition, and metric emission
 *   for phase duration + drafts counter.
 *
 *   An integration test would primarily verify DI wiring of the executor
 *   against the real `ToolGatewayPort` + RLS-bound DB. That wiring is
 *   implicitly exercised by the controller live-pipeline integration test
 *   (`agent-turn-controller.live-pipeline.integration.spec.ts`) which composes
 *   the full router → BoundedExecutor → synthesizer → SSE pipeline. Standing
 *   up an isolated NestJS test module purely for the executor would duplicate
 *   that coverage without exercising any new failure mode.
 *
 *   The placeholders below mark the two cases worth promoting if/when
 *   executor-specific DB-bound behaviour appears (e.g. circuit-breaker state
 *   persisted via a future repository, or tool-gateway invocations whose RLS
 *   guarantees are not covered by the gateway's own integration tests).
 */

import { describe, it } from 'vitest'

describe('BoundedExecutor integration', () => {
  it.todo('phase-1 + phase-2 dispatch with real ToolGateway + RLS')
  it.todo('phaseContextNote propagation when phase-1 returns circuit-breaker state')
})
