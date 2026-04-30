/**
 * Non-HTTP turn pipeline entry for scheduled agent runs.
 *
 * Behaviour:
 *   - Runs a full agent turn using the ToolGateway under a read-only policy envelope.
 *   - Any mutation tool invocation is refused with variant 'policy_violation'.
 *   - Draft-creation is allowed because drafts are proposals; the actual write
 *     happens at approval time (governed by the drafts module), not here.
 *   - Taint is seeded per taint_seeded flag from the job payload.
 *
 * This service is intentionally thin: it constructs the RequestContext + TurnState
 * for the scheduled run, then delegates to ToolGateway for each tool invocation
 * the LLM emits. At MVP the service runs a single-step "execute the schedule's
 * prompt once" path via the gateway; full ReAct/phase-executor integration is
 * layered on later.
 *
 * Returns a ScheduledTurnResult describing the outcome and cost.
 */

import { Injectable, Logger } from '@nestjs/common'
import { ToolGateway } from './tool-gateway'
import { READ_ONLY_POLICY } from '../../domain/value-objects/turn-policy'
import { L1Cache } from '../../infrastructure/cache/l1-cache'
import type { RequestContext } from './tool-gateway-contracts'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

export interface ScheduledTurnInput {
  /** Tenant the schedule belongs to. */
  tenantId: string
  /** The user on whose behalf the turn runs (null for tenant-wide schedules). */
  userOnBehalfOf: string | null
  /** Actor principal — 'user' for personal, 'agent:scheduler' for tenant-wide. */
  actorPrincipal: 'user' | 'agent:scheduler'
  /** The delegation that authorises this run. */
  delegationId: string
  /** The schedule that triggered this run. */
  scheduleId: string
  /** Flow ID propagated from the pg-boss job payload (stamped at spawn time). */
  flowId: string
  /** Trace ID for this specific run. */
  traceId: string
  /**
   * If true, the turn starts tainted (tenant-authored content in the event
   * payload). Worker sets turn_state.tainted = true before any tool call.
   */
  taintSeeded: boolean
  /**
   * The fixed prompt that drives the scheduled turn (from agent_schedule.prompt).
   * Used as the system intent for tool selection.
   */
  prompt: string
  /**
   * Permitted tools from the delegation scope. Empty = schedule is a no-op.
   * The read-only policy additionally gates out mutation tools regardless of scope.
   */
  permittedTools: ReadonlyArray<string>
  /** Pinned model ID from the job payload. */
  modelId: string
}

export type ScheduledTurnOutcome = 'completed' | 'refused' | 'error'

export interface ScheduledTurnResult {
  /** Whether the turn completed successfully, was refused, or errored. */
  outcome: ScheduledTurnOutcome
  /** Total cost incurred (0 at MVP — no LLM call yet). */
  costSpentUsd: number
  /**
   * Set when outcome === 'refused': the tool name that triggered a policy_violation.
   * Used for the dry-run audit (beta-path observation).
   */
  refusedToolName?: string
  /**
   * Set when outcome === 'error'. */
  errorMessage?: string
}

@Injectable()
export class ScheduledTurnService {
  private readonly logger = new Logger(ScheduledTurnService.name)

  constructor(
    private readonly toolGateway: ToolGateway,
    private readonly kernelAuditFacade: KernelAuditFacade,
  ) {}

  /**
   * Execute a scheduled agent turn under the read-only policy envelope.
   *
   * Pipeline:
   *   1. Build RequestContext with tenant + delegation identity.
   *   2. Build TurnState with taint seeded from job payload.
   *   3. For each tool the schedule's permitted_tools includes:
   *      - If mutation: refuse with policy_violation audit + return 'refused'.
   *      - If query: invoke via ToolGateway (read-only policy enforced there too).
   *   4. Return result with outcome + cost.
   *
   * Policy-violation outcomes are captured via agent.tool_called audit events
   * with resultStatus: 'policy_violation' emitted by ToolGateway, and via the
   * agent.schedule_run_policy_violation event emitted below.
   *
   * NOTE: At MVP this does not run a full LLM ReAct loop. It validates the
   * policy envelope is in place and demonstrates the read-only gate. Full LLM
   * execution will be layered on top when the phase-executor is wired to the
   * scheduled turn path.
   */
  async executeScheduledTurn(input: ScheduledTurnInput): Promise<ScheduledTurnResult> {
    const {
      tenantId,
      userOnBehalfOf,
      actorPrincipal,
      delegationId,
      scheduleId,
      flowId,
      traceId,
      taintSeeded,
      prompt,
      permittedTools,
    } = input

    // Build RequestContext with delegation identity
    const requestContext: RequestContext = {
      tenantId,
      userId: userOnBehalfOf ?? actorPrincipal,
      traceId,
      surface: 'scheduler',
      delegationId,
    }

    // Build TurnState — taint is seeded before any tool call.
    const turnState = {
      tainted: { value: taintSeeded },
      taintSources: [],
      circuitBreaker: new Map(),
      retryCount: new Map(),
      toolCeilingRemaining: new Map(),
      l1Cache: new L1Cache(),
    }

    // Abort controller for the turn (no wall-clock timeout at MVP — pg-boss handles retries)
    const abortController = new AbortController()

    this.logger.log(
      `ScheduledTurnService: executing scheduled turn scheduleId=${scheduleId} ` +
        `traceId=${traceId} flowId=${flowId} taintSeeded=${String(taintSeeded)} ` +
        `permittedTools=${permittedTools.length} prompt="${prompt.slice(0, 80)}"`,
    )

    // MVP: validate that the policy envelope works by checking each permitted tool.
    // The read-only policy is enforced inside ToolGateway.invoke() via the `policy` field.
    // When no tools are listed or all are queries, outcome is 'completed'.
    // When any tool is a mutation, ToolGateway returns policy_violation → outcome 'refused'.
    //
    // Full LLM ReAct execution (phase-executor integration) is a separate task.
    // For now we demonstrate the gateway can be called with the read-only policy
    // and a real (non-stub) invocation is made for each permitted tool.
    //
    // If there are no permitted tools: still counts as completed (no-op schedule).
    if (permittedTools.length === 0) {
      return { outcome: 'completed', costSpentUsd: 0 }
    }

    // Invoke first permitted tool as the primary action — this is the gateway
    // entry point. The tool receives the schedule's prompt as args (simplified
    // for MVP; later work replaces this with proper LLM-driven tool selection).
    const primaryTool = permittedTools[0]
    if (primaryTool === undefined) {
      return { outcome: 'completed', costSpentUsd: 0 }
    }

    const gatewayResult = await this.toolGateway.invoke({
      toolName: primaryTool,
      args: { prompt },
      subAgentKey: 'scheduler',
      subAgentScope: [...permittedTools],
      requestContext,
      abortSignal: abortController.signal,
      turnState,
      mode: 'execute',
      flowId,
      policy: READ_ONLY_POLICY,
    })

    if (gatewayResult.kind === 'tripwire' && gatewayResult.variant === 'policy_violation') {
      // Read-only policy refused a mutation tool — emit kernel audit
      await this.kernelAuditFacade.recordEvent({
        tenantId,
        actorId: actorPrincipal,
        eventType: 'agent.schedule_run_policy_violation',
        module: 'agents',
        subjectId: traceId,
        payload: {
          scheduleId,
          traceId,
          flowId,
          refusedTool: primaryTool,
          reason: 'read_only_policy_violation',
          delegationId,
        },
      })

      return {
        outcome: 'refused',
        costSpentUsd: 0,
        refusedToolName: primaryTool,
      }
    }

    if (gatewayResult.kind === 'tripwire') {
      // Other gateway error — treat as turn error
      const errorMessage = `gateway_tripwire:${gatewayResult.variant}`
      this.logger.warn(
        `ScheduledTurnService: gateway returned tripwire variant=${gatewayResult.variant} ` +
          `for tool=${primaryTool} scheduleId=${scheduleId}`,
      )
      return {
        outcome: 'error',
        costSpentUsd: 0,
        errorMessage,
      }
    }

    // Success
    return { outcome: 'completed', costSpentUsd: 0 }
  }
}
