/**
 * Composes the router-turn pipeline:
 *   1. Load or create an `agent_session` row; pin content hashes on create.
 *   2. On subsequent turns, use pinned hashes; re-build prompt + verify hash match.
 *   3. Call the router LLM via RouterLlmClient; parse via RouterDecisionParser.
 *   4. One retry-on-schema-fail loop (2 attempts total).
 *   5. On bounded plan: emit `agent.sub_agent_invoked` audit events per directive.
 *   6. On escalate (2 failed parses) or disambiguation plan: return disambiguation result.
 *
 * DB access pattern:
 *   All DB calls (findByConversation, narrative build/store, create session) are
 *   sequential awaits — the request-bound pg.PoolClient cannot execute concurrent
 *   queries (CLAUDE.md: "Never use Promise.all for DB queries inside handlers").
 */

import { Injectable, Inject, Logger } from '@nestjs/common'
import { trace, SpanStatusCode, context, type Span } from '@opentelemetry/api'
import { uuidv7 } from 'uuidv7'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { AgentSessionPort } from '../../domain/ports/agent-session.port'
import { AGENT_SESSION_PORT } from '../../domain/ports/agent-session.port'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'
import type {
  RouterPlan,
  BoundedPlan,
  IterativePlan,
} from '../../domain/value-objects/router-plan-schema'
import { ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER } from '../../domain/value-objects/router-plan-schema'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'
import { canonicalize, CANONICALIZER_VERSION_HASH } from '../../infrastructure/cache/canonical-args'
import {
  SubAgentRegistry,
  SUB_AGENT_REGISTRY,
} from '../../infrastructure/registry/sub-agent-registry'
import { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import {
  PermissionNarrativeBuilder,
  PERMISSION_NARRATIVE_BUILDER,
} from './permission-narrative-builder'
import { RouterPromptBuilder, ROUTER_PROMPT_BUILDER } from './router-prompt-builder'
import { SubAgentRetriever, SUB_AGENT_RETRIEVER, estimateTokens } from './sub-agent-retriever'
import { RouterDecisionParser, ROUTER_DECISION_PARSER } from './router-decision-parser'
import type { ParseResult } from './router-decision-parser'
import { RouterLlmClient, ROUTER_LLM_CLIENT } from '../../infrastructure/llm/router-llm-client'
import { ROUTER_PROMPT_TOKEN_CEILING } from './router-budget'
import {
  recordRouterDecision,
  recordRouterParseRetry,
  recordSubAgentInvoked,
  recordTopologyDowngradeCandidateTotal,
} from '../../infrastructure/observability/gateway-metrics'
import { IterativeOrchestrator, ITERATIVE_ORCHESTRATOR } from './iterative-orchestrator'
import type { IterativeOrchestratorOpts } from './iterative-orchestrator'
import type { PhaseExecutionResult, PhaseExecutorTurnState } from './phase-executor-contracts'
import type { StreamEmitter } from './stream-gateway'
import { RouterLlmFailureError, type RouterLlmFailureCause } from './pipeline-errors'

export const ROUTER_SESSION_ORCHESTRATOR = Symbol('ROUTER_SESSION_ORCHESTRATOR')

export type UUID = string

export interface RouteTurnOpts {
  readonly tenantId: UUID
  readonly userId: UUID
  readonly roleKey: string
  readonly roleAllowedPermissions: ReadonlySet<string>
  readonly enabledModules: ReadonlySet<string>
  readonly surface: 'global-chat' | 'inline' | 'async'
  readonly conversationId: UUID
  readonly turnTraceId: UUID
  readonly utterance: string
  readonly recentSummary: WindowedSummaries
  readonly promptVariables: ReadonlyMap<SubAgentKey, Record<string, unknown>>
}

export type RouteTurnResult =
  | { kind: 'bounded'; plan: RouterPlan; sessionId: UUID; parseRetries: 0 | 1 }
  | { kind: 'iterative'; result: PhaseExecutionResult; sessionId: UUID; parseRetries: 0 | 1 }
  | { kind: 'disambiguation'; reason: string; sessionId: UUID; parseRetries: 0 | 1 }

const tracer = trace.getTracer('agents.router')

@Injectable()
export class RouterSessionOrchestrator {
  private readonly logger = new Logger(RouterSessionOrchestrator.name)

  /**
   * Tool catalog hash — computed once at construction time and cached.
   * The tool registry is populated during AgentsModule.onModuleInit (before any
   * request is handled), so the hash is stable for the lifetime of the process.
   */
  private _toolCatalogHashCache: string | undefined

  constructor(
    @Inject(AGENT_SESSION_PORT) private readonly agentSessionPort: AgentSessionPort,
    @Inject(PERMISSION_NARRATIVE_BUILDER)
    private readonly permissionNarrativeBuilder: PermissionNarrativeBuilder,
    @Inject(SUB_AGENT_REGISTRY) private readonly subAgentRegistry: SubAgentRegistry,
    @Inject(ROUTER_PROMPT_BUILDER) private readonly routerPromptBuilder: RouterPromptBuilder,
    @Inject(SUB_AGENT_RETRIEVER) private readonly subAgentRetriever: SubAgentRetriever,
    @Inject(ROUTER_DECISION_PARSER) private readonly parser: RouterDecisionParser,
    @Inject(ROUTER_LLM_CLIENT) private readonly llmClient: RouterLlmClient,
    private readonly toolRegistry: ToolRegistry,
    private readonly kernelAuditFacade: KernelAuditFacade,
    private readonly kernelQueryFacade: KernelQueryFacade,
    @Inject(ITERATIVE_ORCHESTRATOR) private readonly iterativeOrchestrator: IterativeOrchestrator,
  ) {}

  async routeTurn(opts: RouteTurnOpts): Promise<RouteTurnResult> {
    const parentSpan = tracer.startSpan('ROUTER_PLAN')
    const parentCtx = trace.setSpan(context.active(), parentSpan)

    try {
      return await context.with(parentCtx, () => this._pipeline(opts, parentSpan))
    } catch (err) {
      parentSpan.recordException(err instanceof Error ? err : new Error(String(err)))
      parentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    } finally {
      parentSpan.end()
    }
  }

  private async _pipeline(opts: RouteTurnOpts, parentSpan: Span): Promise<RouteTurnResult> {
    const {
      tenantId,
      userId,
      roleKey,
      roleAllowedPermissions,
      enabledModules,
      surface,
      conversationId,
      turnTraceId,
      utterance,
      recentSummary,
      promptVariables,
    } = opts

    const existingSession = await this.agentSessionPort.findByConversation({
      tenantId,
      userId,
      conversationId,
    })

    const toolCatHash = this._getToolCatalogHash()

    let sessionId: UUID
    let systemPrompt: string
    let developerMessage: string
    let pinnedSubAgentPromptHashes: Record<string, string>

    if (existingSession) {
      sessionId = existingSession.id
      pinnedSubAgentPromptHashes = existingSession.pinnedSubAgentPromptHashes

      const narrative = await this._buildNarrativeSpan({ tenantId, roleKey, userId })

      const resolved = this.subAgentRegistry.resolveForSession({
        tenantId,
        userId,
        surface,
        enabledModules,
        roleAllowedPermissions,
        promptVariables,
      })

      // Re-build prompt — must reproduce the same hash.
      const promptResult = await this._buildPromptSpan({
        tenantId,
        userId,
        surface,
        roleKey,
        roleAllowedPermissions,
        subAgents: [...resolved],
        permissionNarrative: narrative.text,
        recentSummaryWindow: recentSummary,
        toolCatalogHash: toolCatHash,
        retrievalActivated: false,
        resolvedCount: resolved.length,
      })

      // Hash drift detection — mismatch = deployment / rollout bug
      if (promptResult.routerPromptHash !== existingSession.routerPromptHash) {
        this.logger.error('Router prompt hash drift — session pinning violated (deployment bug)', {
          tenantId,
          sessionId: existingSession.id,
          pinnedHash: existingSession.routerPromptHash,
          rebuiltHash: promptResult.routerPromptHash,
        })
        parentSpan.setAttributes({ 'router.hash_drift': true })
        this._safeMetric(() => recordRouterDecision(tenantId, 'disambiguation'))
        return {
          kind: 'disambiguation',
          reason: 'internal_hash_drift',
          sessionId: existingSession.id,
          parseRetries: 0,
        }
      }

      systemPrompt = promptResult.systemPrompt
      developerMessage = promptResult.developerMessage

      parentSpan.setAttributes({
        router_prompt_hash: existingSession.routerPromptHash,
        permission_narrative_hash: existingSession.permissionNarrativeHash,
        tool_catalog_hash: existingSession.toolCatalogHash,
        directive_schema_hash: existingSession.directiveSchemaHash,
        canonicalizer_version_hash: existingSession.canonicalizerVersionHash,
        sub_agent_count_available: resolved.length,
        sub_agent_count_selected: resolved.length,
        'agent.router.retrieval_activated': false,
      })
    } else {
      const narrative = await this._buildNarrativeSpan({ tenantId, roleKey, userId })

      const resolvedAll = this.subAgentRegistry.resolveForSession({
        tenantId,
        userId,
        surface,
        enabledModules,
        roleAllowedPermissions,
        promptVariables,
      })

      const estimated = estimateTokens({
        subAgents: resolvedAll.map((r) => r.config),
        permissionNarrative: narrative.text,
        recentSummary,
      })

      let resolvedSubAgents = resolvedAll
      let retrievalActivated = false

      if (estimated > ROUTER_PROMPT_TOKEN_CEILING) {
        retrievalActivated = true
        this.logger.log('Token budget exceeded ceiling — activating sub-agent retrieval', {
          tenantId,
          estimated,
          ceiling: ROUTER_PROMPT_TOKEN_CEILING,
        })
        // retrieve returns ValidatedSubAgentConfig[]; filter resolvedAll to preserve heavy resolution
        const narrowedConfigs = await this.subAgentRetriever.retrieve({
          tenantId,
          utterance,
          recentSummary,
          candidates: resolvedAll.map((r) => r.config),
          topK: 8,
          alwaysInclude: new Set() as ReadonlySet<SubAgentKey>,
        })
        const narrowedKeys = new Set(narrowedConfigs.map((c) => c.key as string))
        resolvedSubAgents = resolvedAll.filter((r) => narrowedKeys.has(r.config.key as string))
      }

      const promptResult = await this._buildPromptSpan({
        tenantId,
        userId,
        surface,
        roleKey,
        roleAllowedPermissions,
        subAgents: [...resolvedSubAgents],
        permissionNarrative: narrative.text,
        recentSummaryWindow: recentSummary,
        toolCatalogHash: toolCatHash,
        retrievalActivated,
        resolvedCount: resolvedSubAgents.length,
      })

      systemPrompt = promptResult.systemPrompt
      developerMessage = promptResult.developerMessage

      const directiveSchemaHash = canonicalize(ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER).hash
      const canonicalizerVersionHash = CANONICALIZER_VERSION_HASH
      const permissionNarrativeHash = narrative.narrativeHash

      // Sequential DB write — no Promise.all (single pg.PoolClient per request).
      pinnedSubAgentPromptHashes = {}
      for (const r of resolvedSubAgents) {
        pinnedSubAgentPromptHashes[r.config.key as string] = r.subAgentPromptHash
      }

      const created = await this.agentSessionPort.create({
        id: uuidv7(),
        tenantId,
        userId,
        conversationId,
        routerPromptHash: promptResult.routerPromptHash,
        permissionNarrativeHash,
        toolCatalogHash: toolCatHash,
        directiveSchemaHash,
        canonicalizerVersionHash,
        pinnedSubAgentPromptHashes,
      })
      sessionId = created.id

      parentSpan.setAttributes({
        router_prompt_hash: promptResult.routerPromptHash,
        permission_narrative_hash: permissionNarrativeHash,
        tool_catalog_hash: toolCatHash,
        directive_schema_hash: directiveSchemaHash,
        canonicalizer_version_hash: canonicalizerVersionHash,
        sub_agent_count_available: resolvedAll.length,
        sub_agent_count_selected: resolvedSubAgents.length,
        'agent.router.retrieval_activated': retrievalActivated,
      })
    }

    const resolvedModel = this._resolveRouterModel()

    // Attempt 1 — RouterLlmFailureError thrown by _llmCallAndParse on infra
    // failure; propagates to controller. Only ok/retry ParseResult shapes reach
    // the post-call branches below.
    const { parseResult: parseResult1 } = await this._llmCallAndParse(
      resolvedModel,
      systemPrompt,
      developerMessage,
      utterance,
      1,
    )

    if (parseResult1.kind === 'ok') {
      parentSpan.setAttributes({ router_parse_retries: 0 })
      // Inline surface guard: iterative plan on inline surface → retry with hint.
      if (parseResult1.plan.topology === 'iterative' && surface === 'inline') {
        return this._applyInlineSurfaceGuard(
          resolvedModel,
          systemPrompt,
          developerMessage,
          utterance,
          sessionId,
          pinnedSubAgentPromptHashes,
          tenantId,
          userId,
          roleKey,
          turnTraceId,
          0,
          conversationId,
          surface,
        )
      }
      // Permission gate + iterative dispatch or regular bounded/disambig
      return this._handleBoundedOrDisambig(
        parseResult1.plan,
        sessionId,
        pinnedSubAgentPromptHashes,
        tenantId,
        userId,
        roleKey,
        turnTraceId,
        utterance,
        0,
        conversationId,
        surface,
      )
    }

    // Attempt 1 returned parse-retry — schemaInjectedPrompt is provided by
    // the parser. Fall back to a generic schema prompt if absent (defensive).
    const attempt1SchemaPrompt =
      parseResult1.kind === 'retry' ? parseResult1.schemaInjectedPrompt : undefined

    // Attempt 2 (retry)
    this._safeMetric(() => recordRouterParseRetry(tenantId))
    const retrySchemaPrompt = attempt1SchemaPrompt ?? _buildFallbackSchemaPrompt()
    const augmentedSystem = systemPrompt + '\n\n' + retrySchemaPrompt

    const { parseResult: parseResult2 } = await this._llmCallAndParse(
      resolvedModel,
      augmentedSystem,
      developerMessage,
      utterance,
      2,
    )

    if (parseResult2.kind === 'ok') {
      parentSpan.setAttributes({ router_parse_retries: 1 })
      if (parseResult2.plan.topology === 'iterative' && surface === 'inline') {
        return this._applyInlineSurfaceGuard(
          resolvedModel,
          systemPrompt,
          developerMessage,
          utterance,
          sessionId,
          pinnedSubAgentPromptHashes,
          tenantId,
          userId,
          roleKey,
          turnTraceId,
          1,
          conversationId,
          surface,
        )
      }
      return this._handleBoundedOrDisambig(
        parseResult2.plan,
        sessionId,
        pinnedSubAgentPromptHashes,
        tenantId,
        userId,
        roleKey,
        turnTraceId,
        utterance,
        1,
        conversationId,
        surface,
      )
    }

    // Escalation: both attempts failed. Emit the final `router-decision:parse`
    // span with parse_outcome='escalate' to signal that both attempts were
    // exhausted and the router is handing off to disambiguation (third possible
    // parse_outcome value: ok | retry | escalate).
    const escalateParseSpan = tracer.startSpan('router-decision:parse')
    escalateParseSpan.setAttributes({ retry_round: 1, parse_outcome: 'escalate' })
    escalateParseSpan.end()

    parentSpan.setAttributes({
      router_parse_retries: 1,
      router_escalated_to_disambiguation: true,
    })

    const escalateReason = 'parse_escalated_after_retry'
    await this._safeAudit({
      tenantId,
      actorId: userId,
      eventType: 'refusal.started',
      module: 'agents',
      subjectId: sessionId,
      payload: {
        reason: 'disambiguation',
        turn_trace_id: turnTraceId,
        session_id: sessionId,
        underlying_reason: escalateReason,
      },
    })

    this._safeMetric(() => recordRouterDecision(tenantId, 'parse_escalated'))

    return { kind: 'disambiguation', reason: escalateReason, sessionId, parseRetries: 1 }
  }

  private async _llmCallAndParse(
    model: { provider: 'openai' | 'anthropic'; model: string },
    systemPrompt: string,
    developerMessage: string,
    userMessage: string,
    attempt: 1 | 2,
  ): Promise<{ parseResult: ParseResult }> {
    const llmSpan = tracer.startSpan('router-llm:call')
    llmSpan.setAttributes({
      'model.provider': model.provider,
      'model.model': model.model,
      attempt,
    })

    let result: Awaited<ReturnType<RouterLlmClient['generate']>>
    try {
      result = await this.llmClient.generate({ model, systemPrompt, developerMessage, userMessage })
      // Set usage attrs before ending the span so they are captured in the export.
      if (result.kind === 'ok') {
        llmSpan.setAttributes({
          'agent.llm.usage.prompt_tokens': result.usage.promptTokens ?? 0,
          'agent.llm.usage.completion_tokens': result.usage.completionTokens ?? 0,
          'agent.llm.usage.total_tokens': result.usage.totalTokens ?? 0,
        })
      }
    } finally {
      llmSpan.end()
    }

    if (result.kind === 'malformed') {
      // LLM call infra failures (5xx, timeout, auth) are typed throws — the
      // controller catches RouterLlmFailureError and maps it to an SSE close-error.
      throw new RouterLlmFailureError(classifyLlmError(result.error), result.error)
    }

    const parseSpan = tracer.startSpan('router-decision:parse')
    parseSpan.setAttributes({ retry_round: attempt - 1 })
    let parseResult: ParseResult
    try {
      parseResult = this.parser.parsePlan(result.plan)
      parseSpan.setAttributes({ parse_outcome: parseResult.kind })
    } finally {
      parseSpan.end()
    }

    return { parseResult }
  }

  /**
   * Handles the inline surface guard for iterative plans.
   *
   * When the router emits an iterative plan on an inline surface:
   *   1. Re-invoke the router with an explicit inline hint.
   *   2. If the result is still iterative (or parse failed) → hard disambiguation refusal.
   *   3. If the result is non-iterative → route it normally via _handleBoundedOrDisambig.
   *
   * Always returns a RouteTurnResult — the caller should return it directly.
   *
   * NOTE: This guard is ONLY called when `plan.topology === 'iterative' && surface === 'inline'`.
   *       The caller is responsible for that pre-check.
   */
  private async _applyInlineSurfaceGuard(
    resolvedModel: { provider: 'openai' | 'anthropic'; model: string },
    systemPrompt: string,
    developerMessage: string,
    utterance: string,
    sessionId: UUID,
    pinnedSubAgentPromptHashes: Record<string, string>,
    tenantId: string,
    userId: string,
    roleKey: string,
    turnTraceId: UUID,
    parseRetries: 0 | 1,
    conversationId: UUID,
    surface: RouteTurnOpts['surface'],
  ): Promise<RouteTurnResult> {
    const inlineHint = 'This is an inline surface. Use bounded topology with single sub-agent.'
    const augmentedSystem = systemPrompt + '\n\n' + inlineHint

    const { parseResult: inlineParseResult } = await this._llmCallAndParse(
      resolvedModel,
      augmentedSystem,
      developerMessage,
      utterance,
      // Treated as a schema-retry attempt — use attempt 2 slot
      2,
    )

    if (inlineParseResult.kind !== 'ok' || inlineParseResult.plan.topology === 'iterative') {
      // Still iterative (or parse failed) → hard disambiguation refusal
      await this._safeAudit({
        tenantId,
        actorId: userId,
        eventType: 'refusal.started',
        module: 'agents',
        subjectId: sessionId,
        payload: {
          reason: 'disambiguation',
          turn_trace_id: turnTraceId,
          session_id: sessionId,
          underlying_reason: 'inline_surface_iterative_plan',
        },
      })
      this._safeMetric(() => recordRouterDecision(tenantId, 'disambiguation'))
      return {
        kind: 'disambiguation',
        reason: 'This request is too complex for inline. Please open global chat.',
        sessionId,
        parseRetries,
      }
    }

    // Retry yielded a non-iterative plan → route it normally
    return this._handleBoundedOrDisambig(
      inlineParseResult.plan,
      sessionId,
      pinnedSubAgentPromptHashes,
      tenantId,
      userId,
      roleKey,
      turnTraceId,
      utterance,
      parseRetries,
      conversationId,
      surface,
    )
  }

  private async _handleBoundedOrDisambig(
    plan: RouterPlan,
    sessionId: UUID,
    pinnedSubAgentPromptHashes: Record<string, string>,
    tenantId: string,
    userId: string,
    roleKey: string,
    turnTraceId: UUID,
    utterance: string,
    parseRetries: 0 | 1,
    conversationId: UUID,
    surface: RouteTurnOpts['surface'],
  ): Promise<RouteTurnResult> {
    const parentSpan = trace.getActiveSpan()

    if (plan.topology === 'iterative') {
      parentSpan?.setAttributes({
        router_parse_retries: parseRetries,
        router_escalated_to_disambiguation: false,
        intent_slug: plan.intent_slug,
        flow_id: plan.flow_id,
        plan_topology: 'iterative',
      })

      // Permission gate: explicit disambiguation — NOT silent bounded downgrade.
      const allowed = await this.kernelQueryFacade.canDo(userId, 'agent.iterative', { tenantId })
      if (!allowed) {
        await this._safeAudit({
          tenantId,
          actorId: userId,
          eventType: 'refusal.started',
          module: 'agents',
          subjectId: sessionId,
          payload: {
            reason: 'disambiguation',
            turn_trace_id: turnTraceId,
            session_id: sessionId,
            underlying_reason: 'iterative_permission_denied',
          },
        })
        this._safeMetric(() => recordRouterDecision(tenantId, 'disambiguation'))
        return {
          kind: 'disambiguation',
          reason:
            'The iterative agent feature is not enabled for your account. ' +
            'Please contact your administrator.',
          sessionId,
          parseRetries,
        }
      }

      this._safeMetric(() => recordRouterDecision(tenantId, 'iterative_plan'))

      // PhaseExecutorTurnState is owned by the phase executor layer; the minimal
      // turn state below satisfies the IterativeOrchestrator's type contract.
      const turnState: PhaseExecutorTurnState = {
        traceId: turnTraceId,
        tenantId,
        userId,
        conversationId,
        sessionId,
        surface,
        tainted: { value: false },
        executionMode: 'default',
        routerReplanCount: 0,
      }
      const abortController = new AbortController()

      const iterativeResult = await this.iterativeOrchestrator.execute({
        initialPlan: plan as IterativePlan,
        userUtterance: utterance,
        turnState,
        abortSignal: abortController.signal,
        streamEmitter: _noopStreamEmitter,
      } satisfies IterativeOrchestratorOpts)

      // Topology-downgrade signal: if a bounded re-plan fired during iterative
      // execution, routerReplanCount will have been incremented to 1. This marks
      // the turn as a topology-downgrade candidate for observability — the
      // iterative topology had to fall back to a bounded re-plan, which suggests
      // the task may be better served by bounded.
      if (turnState.routerReplanCount === 1) {
        parentSpan?.setAttributes({ topology_downgrade_candidate: true })
        this._safeMetric(() => recordTopologyDowngradeCandidateTotal(tenantId))
      }

      return { kind: 'iterative', result: iterativeResult, sessionId, parseRetries }
    }

    if (plan.topology === 'direct') {
      parentSpan?.setAttributes({
        router_parse_retries: parseRetries,
        router_escalated_to_disambiguation: false,
        intent_slug: plan.intent_slug,
        flow_id: plan.flow_id,
        plan_topology: 'direct',
      })
      this._safeMetric(() => recordRouterDecision(tenantId, 'direct_plan'))
      return { kind: 'bounded', plan, sessionId, parseRetries }
    }

    const bounded = plan as BoundedPlan

    // LLM-emitted disambiguation plan
    if (bounded.disambiguation !== undefined) {
      parentSpan?.setAttributes({
        router_parse_retries: parseRetries,
        router_escalated_to_disambiguation: true,
        intent_slug: bounded.intent_slug,
        /**
         * flow_id is LLM-generated per-turn. The Zod schema validates UUID format;
         * on format failure the parse retry handles it. The orchestrator does NOT
         * pre-generate a flow_id to cross-check — design choice is to let the LLM
         * own this correlation id.
         */
        flow_id: bounded.flow_id,
      })

      await this._safeAudit({
        tenantId,
        actorId: userId,
        eventType: 'refusal.started',
        module: 'agents',
        subjectId: sessionId,
        payload: {
          reason: 'disambiguation',
          turn_trace_id: turnTraceId,
          session_id: sessionId,
          underlying_reason: bounded.disambiguation,
        },
      })

      this._safeMetric(() => recordRouterDecision(tenantId, 'disambiguation'))

      return { kind: 'disambiguation', reason: bounded.disambiguation, sessionId, parseRetries }
    }

    // Bounded plan — emit audit events per directive.
    // pinnedSubAgentPromptHashes is passed in from _pipeline — no extra DB call needed.

    // phase1 directives (sequential awaits — single DB client)
    for (const directive of bounded.phase1) {
      const hash = pinnedSubAgentPromptHashes[directive.sub_agent_key]
      if (!hash) {
        this.logger.warn(
          `sub_agent_invoked audit: no pinned hash for ${directive.sub_agent_key} — session may pre-date registration`,
        )
      }
      await this._safeAudit({
        tenantId,
        actorId: userId,
        eventType: 'agent.sub_agent_invoked',
        module: 'agents',
        subjectId: sessionId,
        payload: {
          sub_agent_key: directive.sub_agent_key,
          phase: 'phase1',
          iteration: null,
          caller_user_id: userId,
          role_key: roleKey,
          turn_trace_id: turnTraceId,
          sub_agent_prompt_hash: hash ?? '',
        },
      })
      this._safeMetric(() => recordSubAgentInvoked(tenantId, directive.sub_agent_key, 'phase1'))
    }

    // phase2 directives (array of 0..3, sequential awaits)
    for (const directive of bounded.phase2) {
      const hash = pinnedSubAgentPromptHashes[directive.sub_agent_key]
      if (!hash) {
        this.logger.warn(
          `sub_agent_invoked audit: no pinned hash for ${directive.sub_agent_key} — session may pre-date registration`,
        )
      }
      await this._safeAudit({
        tenantId,
        actorId: userId,
        eventType: 'agent.sub_agent_invoked',
        module: 'agents',
        subjectId: sessionId,
        payload: {
          sub_agent_key: directive.sub_agent_key,
          phase: 'phase2',
          iteration: null,
          caller_user_id: userId,
          role_key: roleKey,
          turn_trace_id: turnTraceId,
          sub_agent_prompt_hash: hash ?? '',
        },
      })
      this._safeMetric(() => recordSubAgentInvoked(tenantId, directive.sub_agent_key, 'phase2'))
    }

    parentSpan?.setAttributes({
      router_parse_retries: parseRetries,
      router_escalated_to_disambiguation: false,
      intent_slug: bounded.intent_slug,
      /**
       * flow_id is LLM-generated per-turn. The Zod schema validates UUID format;
       * on format failure the parse retry handles it. The orchestrator does NOT
       * pre-generate a flow_id to cross-check — design choice is to let the LLM
       * own this correlation id.
       */
      flow_id: bounded.flow_id,
    })

    this._safeMetric(() => recordRouterDecision(tenantId, 'bounded_plan'))

    return { kind: 'bounded', plan, sessionId, parseRetries }
  }

  /**
   * Fire-and-forget audit event emission. Errors are logged but NEVER re-thrown.
   *
   * Audit events are observability/compliance records; their failure must not abort
   * a user turn or hold the request-scoped DB client. Only wrap calls here — DB
   * writes that are required for correctness (e.g. agentSessionPort.create) must
   * still propagate errors and are NOT wrapped.
   */
  private async _safeAudit(
    payload: Parameters<KernelAuditFacade['recordEvent']>[0],
  ): Promise<void> {
    try {
      await this.kernelAuditFacade.recordEvent(payload)
    } catch (err) {
      this.logger.error('Audit event emission failed — turn continues', { err })
    }
  }

  /**
   * Fire-and-forget metric record. Errors are logged but NEVER re-thrown.
   *
   * OTel counter/histogram `add`/`record` calls should not throw in production
   * (they are no-ops if the provider is absent). But we guard defensively in case
   * a future provider or test shim does throw.
   */
  private _safeMetric(fn: () => void): void {
    try {
      fn()
    } catch (err) {
      this.logger.error('Metric emission failed — turn continues', { err })
    }
  }

  /**
   * Build permission narrative — wrapped in a `permission-narrative:build` child span.
   */
  private async _buildNarrativeSpan(opts: { tenantId: string; roleKey: string; userId: string }) {
    const span = tracer.startSpan('permission-narrative:build')
    try {
      const narrative = await this.permissionNarrativeBuilder.build({
        tenantId: opts.tenantId,
        roleKey: opts.roleKey,
        actorId: opts.userId,
      })
      span.setAttributes({
        from_cache: narrative.fromCache,
        narrative_hash: narrative.narrativeHash,
      })
      return narrative
    } finally {
      span.end()
    }
  }

  /**
   * Build router prompt — wrapped in a `router-prompt:build` child span.
   * Used by both the new-session and existing-session paths so span coverage
   * is consistent regardless of session state.
   */
  private async _buildPromptSpan(
    opts: Parameters<RouterPromptBuilder['build']>[0] & {
      retrievalActivated: boolean
      resolvedCount: number
    },
  ): Promise<ReturnType<RouterPromptBuilder['build']>> {
    const { retrievalActivated, resolvedCount, ...buildOpts } = opts
    const span = tracer.startSpan('router-prompt:build')
    let promptResult: ReturnType<RouterPromptBuilder['build']>
    try {
      promptResult = this.routerPromptBuilder.build(buildOpts)
      span.setAttributes({
        router_prompt_hash: promptResult.routerPromptHash,
        sub_agent_count: resolvedCount,
        tool_count: this.toolRegistry.listAgentTools().length,
        'agent.router.retrieval_activated': retrievalActivated,
      })
    } finally {
      span.end()
    }
    return promptResult
  }

  /**
   * Get or compute the tool catalog hash.
   * Cached — the tool registry is stable for the process lifetime.
   */
  private _getToolCatalogHash(): string {
    if (this._toolCatalogHashCache) return this._toolCatalogHashCache
    const tools = this.toolRegistry.listAgentTools()
    const { hash } = canonicalize(
      tools.map((t) => ({ name: t.name, permission: t.permission, meta: t.meta })),
    )
    this._toolCatalogHashCache = hash
    return hash
  }

  /**
   * Resolve the model for the router LLM call.
   * At MVP the router uses gpt-4o; per-tenant model selection is wired later.
   */
  private _resolveRouterModel(): { provider: 'openai'; model: string } {
    return { provider: 'openai', model: 'gpt-4o' }
  }
}

/**
 * Classify a router-LLM call failure into one of three `RouterLlmFailureCause`
 * buckets. The Vercel AI SDK's `APICallError` exposes `statusCode`;
 * AbortController-driven timeouts surface as `AbortError`. Some upstream
 * wrappers may use `status` instead of `statusCode`, so we accept both.
 * Unknown failures fall back to `llm_5xx` (transient retry semantics at the
 * caller layer).
 */
function classifyLlmError(err: unknown): RouterLlmFailureCause {
  if (typeof err === 'object' && err !== null) {
    const e = err as { status?: number; statusCode?: number; name?: string; message?: string }
    const status = e.status ?? e.statusCode
    if (status === 401 || status === 403) return 'auth_error'
    if (status !== undefined && status >= 500) return 'llm_5xx'
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'llm_timeout'
    // RouterLlmClient wraps abort/timeout errors with a recognizable marker in
    // the message (see router-llm-client.ts) — fall back to message inspection
    // when no `name` survived the wrap.
    if (typeof e.message === 'string' && /aborted|timeout/i.test(e.message)) return 'llm_timeout'
  }
  return 'llm_5xx'
}

function _buildFallbackSchemaPrompt(): string {
  const schemaJson = JSON.stringify(ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER, null, 2)
  return (
    `Your previous response did not match the required RouterPlan schema. ` +
    `Emit only a valid JSON object matching:\n${schemaJson}\n` +
    `No markdown fences. No prose before or after.`
  )
}

/**
 * No-op StreamEmitter used when RouterSessionOrchestrator dispatches an
 * IterativeOrchestrator.execute() call directly. The full SSE wiring lives
 * in the HTTP controller layer; this stub satisfies the type contract.
 */
const _noopStreamEmitter: StreamEmitter = {
  emit: () => {},
  close: () => {},
  error: () => {},
}
