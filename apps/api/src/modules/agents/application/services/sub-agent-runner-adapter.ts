/**
 * SubAgentRunnerAdapter — Plan 17 PR 2 Task 6
 *
 * Implements `ISubAgentRunner` for NestJS DI wiring. Drives the real ReAct
 * loop end-to-end:
 *
 *   1. Resolve the `ValidatedSubAgentConfig` for `directive.sub_agent_key` from
 *      `SubAgentRegistry`. Unknown keys throw loud (no silent fallback).
 *   2. Honour pre-fired abort signals — short-circuit to `kind: 'aborted'`.
 *   3. Build a `BridgeAccumulator` and bridge the sub-agent's `toolScope` onto
 *      Vercel-AI-SDK `tool({...})` shapes via `buildSubAgentTools` (Task 4).
 *   4. Resolve the model (static or function-valued) against a `TenantContext`.
 *   5. Run the ReAct loop via `runReactLoop` (Task 5) — catches HardTripwireError
 *      and AbortError, surfaces them as discriminated result branches.
 *   6. Translate the driver result into a `SubAgentOutput` via the existing
 *      `buildSubAgentOutput` helper (precedence: `ceilingHit` > schema-fail >
 *      completed). Hard-tripwire branches feed an empty rawStructured so the
 *      output schema fails to parse and the kind lands as `'errored'`.
 *
 * Cross-cutting:
 *   - `intentSlug`/`flowId` are not present on `SubAgentDirective`; the gateway
 *     invokeContext leaves them undefined (their schema marks them optional).
 *   - `policy: INTERACTIVE_POLICY` is the default for orchestrator-driven turns;
 *     scheduled async turns flow through a different code path with READ_ONLY.
 */

import { Injectable, Inject, Logger } from '@nestjs/common'
import type { ZodType } from 'zod'
import type { ISubAgentRunner, IterativeSubAgentRunOpts } from './iterative-orchestrator'
import type { SubAgentOutput, ConfidenceSignals } from './phase-executor-contracts'
import { buildSubAgentOutput } from './sub-agent-runner'
import {
  SubAgentRegistry,
  SUB_AGENT_REGISTRY,
} from '../../infrastructure/registry/sub-agent-registry'
import { ToolRegistry, TOOL_REGISTRY } from '../../infrastructure/tool-registry/tool-registry'
import {
  buildSubAgentTools,
  newAccumulator,
  type BridgeAccumulator,
} from '../../infrastructure/tool-gateway/tool-gateway-bridge'
import { runReactLoop } from './react-loop-driver'
import {
  SUB_AGENT_LLM_CLIENT,
  type SubAgentLlmClient,
} from '../../infrastructure/llm/sub-agent-llm-client'
import { TOOL_GATEWAY, type ToolGatewayPort } from './tool-gateway-contracts'
import type { RequestContext, TurnState, ToolGatewayInvokeInput } from './tool-gateway-contracts'
import { INTERACTIVE_POLICY } from '../../domain/value-objects/turn-policy'
import { L1Cache } from '../../infrastructure/cache/l1-cache'
import {
  recordSubAgentIteration,
  recordSubAgentToolFailure,
} from '../../infrastructure/observability/sub-agent-metrics'
import type {
  ModelChoice,
  TenantContext,
  ValidatedSubAgentConfig,
} from '../../domain/services/sub-agent-types'
import type { SubAgentDirective } from '../../domain/value-objects/router-plan-schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a deterministic user message for the sub-agent. Encodes the directive's
 * input (treated as the user goal) plus the LLM's rationale for dispatch.
 */
function buildSubAgentUserMessage(directive: SubAgentDirective): string {
  const utterance =
    typeof directive.input === 'object' &&
    directive.input !== null &&
    'utterance' in directive.input &&
    typeof (directive.input as Record<string, unknown>)['utterance'] === 'string'
      ? ((directive.input as Record<string, unknown>)['utterance'] as string)
      : ''

  const lines: string[] = []
  if (utterance) {
    lines.push(`Goal: ${utterance}`)
  }
  if (directive.reason) {
    lines.push(`Reason: ${directive.reason}`)
  }
  // Always include the raw input payload as a structured fallback so the LLM can
  // recover sub-agent inputs that don't fit the utterance shape.
  lines.push(`Input: ${JSON.stringify(directive.input)}`)
  return lines.join('\n')
}

/**
 * Best-effort summary extractor for the sub-agent output. Pulls a string-shaped
 * `summary` field from the structured output if present; otherwise falls back
 * to the model's free-text response.
 */
function extractSummary(rawStructured: unknown, fallbackText: string): string {
  if (
    typeof rawStructured === 'object' &&
    rawStructured !== null &&
    'summary' in rawStructured &&
    typeof (rawStructured as Record<string, unknown>)['summary'] === 'string'
  ) {
    return (rawStructured as Record<string, unknown>)['summary'] as string
  }
  return fallbackText
}

function resolveModel(
  configModel: ValidatedSubAgentConfig['model'],
  tenantContext: TenantContext,
): ModelChoice {
  return typeof configModel === 'function' ? configModel(tenantContext) : configModel
}

/**
 * Builds the tool-gateway-specific `TurnState` for this sub-agent run. Distinct
 * from `PhaseExecutorTurnState` (which carries iterative-loop bookkeeping); the
 * gateway's TurnState is a per-sub-agent bag of taint, circuit-breaker, retry,
 * and L1 cache state.
 */
function buildGatewayTurnState(taintFlag: { value: boolean }): TurnState {
  return {
    tainted: taintFlag,
    taintSources: [],
    circuitBreaker: new Map(),
    retryCount: new Map(),
    toolCeilingRemaining: new Map(),
    l1Cache: new L1Cache(),
  }
}

function abortedOutput(
  subAgentKey: string,
  accumulator: BridgeAccumulator,
  schema: ZodType,
): SubAgentOutput {
  // Drive abort outputs through buildSubAgentOutput so confidence/structured
  // fields stay consistent with the rest of the contract. Schema parses against
  // {} → fails → kind would be 'errored'; we override to 'aborted' explicitly.
  const signals: ConfidenceSignals = {
    toolResultCount: accumulator.toolResultCount,
    retryCount: accumulator.retryCount,
    toolFailureCount: accumulator.toolFailureCount,
    taintFlippedDuringRun: accumulator.taintFlippedDuringRun,
    ceilingHit: false,
    semanticConflictWithSibling: accumulator.semanticConflictWithSibling,
    circuitBreakerEventOccurred: accumulator.circuitBreakerEventOccurred,
  }
  // Hand-build the output so we can stamp kind:'aborted' (buildSubAgentOutput
  // does not surface that branch).
  const built = buildSubAgentOutput({
    rawStructured: {},
    outputSchema: schema,
    signals,
    summary: '',
    semantics: subAgentKey,
    sourceToolProvenance: accumulator.sourceToolProvenance,
    circuitBreakerState: accumulator.circuitBreakerState,
    drafts: accumulator.drafts,
  })
  return {
    ...built,
    kind: 'aborted',
    abortReason: 'user',
  }
}

// ─── SubAgentRunnerAdapter ────────────────────────────────────────────────────

@Injectable()
export class SubAgentRunnerAdapter implements ISubAgentRunner {
  private readonly logger = new Logger(SubAgentRunnerAdapter.name)

  constructor(
    @Inject(SUB_AGENT_REGISTRY) private readonly subAgentRegistry: SubAgentRegistry,
    @Inject(SUB_AGENT_LLM_CLIENT) private readonly llmClient: SubAgentLlmClient,
    @Inject(TOOL_GATEWAY) private readonly toolGateway: ToolGatewayPort,
    @Inject(TOOL_REGISTRY) private readonly toolRegistry: ToolRegistry,
  ) {}

  async run(opts: IterativeSubAgentRunOpts): Promise<SubAgentOutput> {
    const { directive, abortSignal, turnState } = opts
    const subAgentKey = directive.sub_agent_key

    const config = this.subAgentRegistry.get(subAgentKey)
    if (!config) {
      throw new Error(`SubAgentRunnerAdapter: unknown sub_agent_key "${subAgentKey}"`)
    }

    // Build accumulator early so even an early-abort surface has a consistent
    // (zeroed) accumulator state.
    const accumulator = newAccumulator()

    if (abortSignal.aborted) {
      recordSubAgentIteration({ subAgentKey, outcome: 'aborted' })
      return abortedOutput(subAgentKey, accumulator, config.outputSchema)
    }

    // ── Construct gateway invoke context ───────────────────────────────────────
    const requestContext: RequestContext = {
      tenantId: turnState.tenantId,
      userId: turnState.userId,
      traceId: turnState.traceId,
      surface: turnState.surface,
    }

    const gatewayTurnState = buildGatewayTurnState(turnState.tainted)

    const invokeContext: Omit<ToolGatewayInvokeInput, 'toolName' | 'args'> = {
      subAgentKey,
      subAgentScope: config.toolScope,
      requestContext,
      abortSignal,
      turnState: gatewayTurnState,
      mode: 'execute',
      policy: INTERACTIVE_POLICY,
      userUtterance:
        typeof directive.input === 'object' &&
        directive.input !== null &&
        typeof (directive.input as Record<string, unknown>)['utterance'] === 'string'
          ? ((directive.input as Record<string, unknown>)['utterance'] as string)
          : undefined,
    }

    const tools = buildSubAgentTools({
      toolScope: config.toolScope,
      registry: this.toolRegistry,
      toolGateway: this.toolGateway,
      invokeContext,
      accumulator,
    })

    // ── Resolve model + run loop ──────────────────────────────────────────────
    const tenantContext: TenantContext = {
      tenantId: turnState.tenantId,
      surface: turnState.surface,
    }
    const model = resolveModel(config.model, tenantContext)

    this.logger.debug(
      `SubAgentRunnerAdapter.run: sub_agent_key="${subAgentKey}" ` +
        `model="${model.provider}/${model.model}" toolScope=[${config.toolScope.join(',')}]`,
    )

    const driverResult = await runReactLoop({
      llmClient: this.llmClient,
      model,
      system: config.promptTemplate.body,
      userMessage: buildSubAgentUserMessage(directive),
      tools,
      outputSchema: config.outputSchema,
      maxIterations: config.budgets.maxIterations,
      abortSignal,
      accumulator,
    })

    // ── Branch on driverResult ────────────────────────────────────────────────
    if (driverResult.aborted) {
      recordSubAgentIteration({ subAgentKey, outcome: 'aborted' })
      return abortedOutput(subAgentKey, accumulator, config.outputSchema)
    }

    if (driverResult.hardTripwire) {
      recordSubAgentIteration({ subAgentKey, outcome: 'errored' })
      recordSubAgentToolFailure({
        subAgentKey,
        toolName: driverResult.hardTripwire.toolName,
        tripwireKind: driverResult.hardTripwire.tripwire.variant,
        severity: 'hard',
      })
      // Schema parse against {} → fails → kind='errored' via buildSubAgentOutput.
      return buildSubAgentOutput({
        rawStructured: {},
        outputSchema: config.outputSchema,
        signals: {
          ...driverResult.signals,
          ceilingHit: false,
        },
        summary: `[error] ${driverResult.hardTripwire.tripwire.variant}`,
        semantics: subAgentKey,
        sourceToolProvenance: accumulator.sourceToolProvenance,
        circuitBreakerState: accumulator.circuitBreakerState,
        drafts: accumulator.drafts,
        usageTotals: driverResult.usageTotals,
      })
    }

    const result = buildSubAgentOutput({
      rawStructured: driverResult.rawStructured,
      outputSchema: config.outputSchema,
      signals: driverResult.signals,
      summary: extractSummary(driverResult.rawStructured, driverResult.text),
      semantics: subAgentKey,
      sourceToolProvenance: accumulator.sourceToolProvenance,
      circuitBreakerState: accumulator.circuitBreakerState,
      drafts: accumulator.drafts,
      usageTotals: driverResult.usageTotals,
    })
    // buildSubAgentOutput resolves to one of {completed, ceiling_hit, errored}
    // (precedence in sub-agent-runner.ts: ceilingHit → schema-fail → completed).
    // The 'aborted' / 'all_tools_disabled' kinds are produced elsewhere.
    recordSubAgentIteration({
      subAgentKey,
      outcome: result.kind as 'completed' | 'ceiling_hit' | 'errored' | 'aborted',
    })
    return result
  }
}
