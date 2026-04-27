/**
 * createRunPipelineFn — Plan 18 §4.5 / Task 7+9.
 *
 * The live composition closure consumed by {@link TurnPipelineRunner} via the
 * `RUN_PIPELINE_FN` DI token. Composes:
 *
 *   • {@link RouterSessionOrchestrator} — router LLM + iterative dispatch
 *   • {@link BoundedExecutor}           — bounded fan-out execution
 *   • {@link WindowBuilder}             — γ/α memory window
 *   • {@link KernelQueryFacade}         — role permissions
 *   • {@link AdminQueryFacade}          — enabled module set (cross-module
 *                                         reads via public facades only —
 *                                         see CLAUDE.md DDD rule).
 *
 * Pre-router DB reads are sequential `await` (CLAUDE.md DB rule — request-bound
 * `pg.PoolClient` cannot run queries in parallel).
 *
 * Extracted from `agents.module.ts` (PR #113) so that:
 *   • the module file stays focused on DI wiring (no inlined logic);
 *   • the factory body is independently unit-testable without the full
 *     NestJS DI graph;
 *   • the result-translator helper lives next to the only caller that
 *     needs it.
 */

import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { BoundedExecutor } from '../services/bounded-executor'
import type { PhaseExecutionResult } from '../services/phase-executor-contracts'
import {
  collectPermissionKeys,
  collectToolNames,
  renderAnswerToMarkdown,
} from '../services/render-answer'
import type {
  RouteTurnOpts,
  RouteTurnResult,
  RouterSessionOrchestrator,
} from '../services/router-session-orchestrator'
import type { RunPipelineFn, TurnPipelineResult } from '../services/turn-pipeline-runner'
import type { WindowBuilder } from '../services/window-builder'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'
import type { BoundedPlan } from '../../domain/value-objects/router-plan-schema'
import { recordPipelineDispatch } from '../../infrastructure/observability/pipeline-metrics'

/**
 * Dependencies injected into {@link createRunPipelineFn}. Order-independent —
 * keys match the DI providers wired in `agents.module.ts`.
 */
export interface RunPipelineDeps {
  readonly routerOrchestrator: RouterSessionOrchestrator
  readonly boundedExecutor: BoundedExecutor
  readonly windowBuilder: WindowBuilder
  readonly kernelQuery: KernelQueryFacade
  readonly adminQuery: AdminQueryFacade
}

/**
 * Build the live `RUN_PIPELINE_FN` closure. The returned function is shared
 * across all turns served by this module; it has no per-turn state of its
 * own — all state lives in the closure arguments and the injected deps.
 */
export function createRunPipelineFn(deps: RunPipelineDeps): RunPipelineFn {
  const { routerOrchestrator, boundedExecutor, windowBuilder, kernelQuery, adminQuery } = deps

  return async (input) => {
    const { userUtterance, conversationId, requestContext, abortSignal, streamEmitter, turnState } =
      input

    // Plan 18 Task 9 — record dispatch outcome on every exit path. Default
    // kind=bounded (most common); update once routed.kind is known. outcome
    // is overridden by the actual TurnPipelineResult.turnEndReason on
    // success paths and forced to 'error' in the catch block.
    let dispatchKind: 'bounded' | 'iterative' | 'disambiguation' = 'bounded'
    let dispatchOutcome: 'completed' | 'cancelled' | 'refused' | 'error' = 'completed'

    try {
      // ── Sequential pre-router reads (CLAUDE.md DB rule) ──────────────────
      const recentSummary =
        requestContext.surface === 'inline'
          ? await windowBuilder.buildInline({
              conversationId,
              tenantId: requestContext.tenantId,
            })
          : await windowBuilder.buildGlobal({
              conversationId,
              tenantId: requestContext.tenantId,
            })
      const rolePermissions = await kernelQuery.getRolePermissions(
        requestContext.roleKey,
        requestContext.tenantId,
      )
      const enabledModules = await adminQuery.listEnabledModules(requestContext.tenantId)

      const roleAllowedPermissions: ReadonlySet<string> = new Set(
        rolePermissions.permissions.map((p) => p.permissionKey),
      )

      const routeOpts: RouteTurnOpts = {
        tenantId: requestContext.tenantId,
        userId: requestContext.userId,
        roleKey: requestContext.roleKey,
        roleAllowedPermissions,
        enabledModules,
        surface: requestContext.surface,
        conversationId,
        turnTraceId: requestContext.traceId,
        utterance: userUtterance,
        recentSummary,
        promptVariables: new Map<SubAgentKey, Record<string, unknown>>(),
      }

      // RouterSessionOrchestrator.routeTurn throws RouterLlmFailureError on
      // infra failure (Plan 18 R-18.24). Let it propagate to the controller.
      const routed: RouteTurnResult = await routerOrchestrator.routeTurn(routeOpts)

      if (routed.kind === 'disambiguation') {
        dispatchKind = 'disambiguation'
        dispatchOutcome = 'refused'
        return {
          toolCallNames: [],
          shape: 'refusal',
          permissionKeys: [],
          taintFlipped: turnState.tainted.value,
          renderedAssistantMessage: routed.reason,
          turnEndReason: 'refused',
          drafts: [],
        }
      }

      if (routed.kind === 'iterative') {
        // The router orchestrator already executed the iterative supervisor
        // loop; results have been streamed by IterativeOrchestrator. Translate
        // PhaseExecutionResult into TurnPipelineResult without re-emitting
        // SSE events.
        dispatchKind = 'iterative'
        const result = phaseResultToPipelineResult(routed.result, turnState.tainted.value)
        dispatchOutcome = result.turnEndReason
        return result
      }

      // routed.kind === 'bounded' — plan.topology may be 'bounded' or 'direct'.
      // Direct execution (Tier 0, single tool, no synthesizer) is not yet
      // wired to a live executor — Plan 18 scope covers bounded + iterative.
      dispatchKind = 'bounded'
      const boundedPlan = assertBoundedTopology(routed.plan)

      const phaseResult = await boundedExecutor.execute({
        plan: boundedPlan,
        userUtterance,
        turnState,
        abortSignal,
        streamEmitter,
      })

      const result = phaseResultToPipelineResult(phaseResult, turnState.tainted.value)
      dispatchOutcome = result.turnEndReason
      return result
    } catch (err) {
      dispatchOutcome = 'error'
      throw err
    } finally {
      recordPipelineDispatch({ kind: dispatchKind, outcome: dispatchOutcome })
    }
  }
}

/**
 * Narrow a {@link RouteTurnResult} 'bounded' branch's plan (a `RouterPlan`
 * union) down to a {@link BoundedPlan}. Throws if the plan's topology is
 * not yet supported by the live pipeline (e.g. 'direct' — Tier 0 routing
 * is reserved for a follow-up plan).
 *
 * Replaces an unchecked `as BoundedPlan` cast at the boundary so the
 * runtime invariant is documented in one place.
 */
function assertBoundedTopology(plan: { topology: string }): BoundedPlan {
  if (plan.topology !== 'bounded') {
    throw new Error(
      `RUN_PIPELINE_FN: topology '${plan.topology}' not yet supported by live pipeline`,
    )
  }
  return plan as BoundedPlan
}

/**
 * Translate a {@link PhaseExecutionResult} into a {@link TurnPipelineResult}.
 *
 * Used for both bounded (BoundedExecutor) and iterative (already executed
 * inside RouterSessionOrchestrator) paths. `taintFlipped` reflects the
 * request-bound `turnState.tainted.value` at the time the result is
 * produced — any sub-agent flipping the flag during ReAct propagates here.
 *
 * Pure: no DI, no metrics, no logging.
 */
export function phaseResultToPipelineResult(
  r: PhaseExecutionResult,
  taintFlipped: boolean,
): TurnPipelineResult {
  switch (r.kind) {
    case 'synthesized':
      return {
        toolCallNames: collectToolNames(r.answer),
        shape: r.answer.shape,
        permissionKeys: collectPermissionKeys(r.answer),
        taintFlipped,
        renderedAssistantMessage: renderAnswerToMarkdown(r.answer),
        turnEndReason: 'completed',
        drafts: r.drafts,
      }
    case 'partial':
      return {
        toolCallNames: collectToolNames(r.answer),
        shape: r.answer.shape,
        permissionKeys: collectPermissionKeys(r.answer),
        taintFlipped,
        renderedAssistantMessage: renderAnswerToMarkdown(r.answer),
        turnEndReason: 'completed',
        drafts: [],
      }
    case 'disambiguation':
      return {
        toolCallNames: [],
        shape: 'refusal',
        permissionKeys: [],
        taintFlipped,
        renderedAssistantMessage: r.question,
        turnEndReason: 'refused',
        drafts: [],
      }
    case 'aborted':
      return {
        toolCallNames: [],
        shape: 'aborted',
        permissionKeys: [],
        taintFlipped,
        renderedAssistantMessage: '',
        turnEndReason: 'cancelled',
        drafts: [],
      }
  }
}
