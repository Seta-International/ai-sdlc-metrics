/**
 * RouterSessionOrchestrator — Plan 02 Task 10 (§5 "Session start", "Router LLM call",
 * "Structured-output retry", §6 R-02.23a)
 *
 * Composes T1..T9 into a single router-turn pipeline:
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
import type { AgentSessionPort } from '../../domain/ports/agent-session.port'
import { AGENT_SESSION_PORT } from '../../domain/ports/agent-session.port'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
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
} from '../../infrastructure/observability/gateway-metrics'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const ROUTER_SESSION_ORCHESTRATOR = Symbol('ROUTER_SESSION_ORCHESTRATOR')

// ─── Public types ─────────────────────────────────────────────────────────────

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
  | { kind: 'disambiguation'; reason: string; sessionId: UUID; parseRetries: 0 | 1 }

// ─── Tracer ───────────────────────────────────────────────────────────────────

const tracer = trace.getTracer('agents.router')

// ─── RouterSessionOrchestrator ────────────────────────────────────────────────

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
  ) {}

  // ─── Main entry ──────────────────────────────────────────────────────────────

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

  // ─── Pipeline ─────────────────────────────────────────────────────────────────

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

    // ── Step 1: Load existing session (sequential DB read) ─────────────────────
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
      // ── Existing session ────────────────────────────────────────────────────────
      sessionId = existingSession.id
      pinnedSubAgentPromptHashes = existingSession.pinnedSubAgentPromptHashes

      // Re-build narrative (sequential DB call — may hit cache)
      const narrative = await this._buildNarrativeSpan({ tenantId, roleKey, userId })

      // Re-resolve sub-agents
      const resolved = this.subAgentRegistry.resolveForSession({
        tenantId,
        userId,
        surface,
        enabledModules,
        roleAllowedPermissions,
        promptVariables,
      })

      // Re-build prompt — must reproduce the same hash (wrapped in child span for consistency)
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
      // ── New session ─────────────────────────────────────────────────────────────

      // Step 2: Build permission narrative (sequential DB call, T6)
      const narrative = await this._buildNarrativeSpan({ tenantId, roleKey, userId })

      // Step 3: Resolve sub-agents (T5)
      const resolvedAll = this.subAgentRegistry.resolveForSession({
        tenantId,
        userId,
        surface,
        enabledModules,
        roleAllowedPermissions,
        promptVariables,
      })

      // Step 4: Token budget check + optional retrieval (T7 estimator + T8 retriever)
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

      // Step 5: Build router prompt (T7) — wrapped in a child span
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

      // Step 6: Create session row (sequential DB write — no Promise.all)
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

    // ── Step 7: LLM call + parse-retry loop ────────────────────────────────────
    const resolvedModel = this._resolveRouterModel()

    // Attempt 1
    let attempt1SchemaPrompt: string | undefined
    const { result: llmResult1, parseResult: parseResult1 } = await this._llmCallAndParse(
      resolvedModel,
      systemPrompt,
      developerMessage,
      utterance,
      1,
    )

    if (parseResult1.kind === 'ok') {
      parentSpan.setAttributes({ router_parse_retries: 0 })
      return this._handleBoundedOrDisambig(
        parseResult1.plan,
        sessionId,
        pinnedSubAgentPromptHashes,
        tenantId,
        userId,
        roleKey,
        turnTraceId,
        0,
      )
    }

    // Attempt 1 failed — collect retry hint
    if (llmResult1.kind === 'ok') {
      // parsePlan returned retry — schemaInjectedPrompt is available
      attempt1SchemaPrompt =
        parseResult1.kind === 'retry' ? parseResult1.schemaInjectedPrompt : undefined
    }
    // llmResult1.kind === 'malformed' → use fallback schema prompt

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
      return this._handleBoundedOrDisambig(
        parseResult2.plan,
        sessionId,
        pinnedSubAgentPromptHashes,
        tenantId,
        userId,
        roleKey,
        turnTraceId,
        1,
      )
    }

    // ── Escalation: both attempts failed ─────────────────────────────────────────
    // Emit the final `router-decision:parse` span with parse_outcome='escalate'
    // to signal that both attempts were exhausted and the router is handing off
    // to disambiguation. This is the third possible parse_outcome value per Plan 02 §8:
    // ok | retry | escalate.
    const escalateParseSpan = tracer.startSpan('router-decision:parse')
    escalateParseSpan.setAttributes({ retry_round: 1, parse_outcome: 'escalate' })
    escalateParseSpan.end()

    parentSpan.setAttributes({
      router_parse_retries: 1,
      router_escalated_to_disambiguation: true,
    })

    const escalateReason = 'parse_escalated_after_retry'
    // Plan 06 owns the `refusal.started` schema canonically; this is the agreed stub
    // shape per Plan 02 R-02.23 + Plan 06 cross-reference.
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

  // ─── LLM call + parse helper ─────────────────────────────────────────────────

  private async _llmCallAndParse(
    model: { provider: 'openai' | 'anthropic'; model: string },
    systemPrompt: string,
    developerMessage: string,
    userMessage: string,
    attempt: 1 | 2,
  ): Promise<{
    result: Awaited<ReturnType<RouterLlmClient['generate']>>
    parseResult: ParseResult
  }> {
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
      // LLM call itself failed — treat as retry
      const parseSpan = tracer.startSpan('router-decision:parse')
      parseSpan.setAttributes({ retry_round: attempt - 1, parse_outcome: 'retry' })
      parseSpan.end()
      return {
        result,
        parseResult: {
          kind: 'retry',
          reason: result.error.message,
          schemaInjectedPrompt: _buildFallbackSchemaPrompt(),
        },
      }
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

    return { result, parseResult }
  }

  // ─── Handle ok plan (bounded or LLM-emitted disambiguation) ──────────────────

  private async _handleBoundedOrDisambig(
    plan: RouterPlan,
    sessionId: UUID,
    pinnedSubAgentPromptHashes: Record<string, string>,
    tenantId: string,
    userId: string,
    roleKey: string,
    turnTraceId: UUID,
    parseRetries: 0 | 1,
  ): Promise<RouteTurnResult> {
    const parentSpan = trace.getActiveSpan()

    // LLM-emitted disambiguation plan
    if (plan.disambiguation !== undefined) {
      parentSpan?.setAttributes({
        router_parse_retries: parseRetries,
        router_escalated_to_disambiguation: true,
        intent_slug: plan.intent_slug,
        /**
         * flow_id is LLM-generated per-turn. The Zod schema validates UUID format;
         * on format failure the parse retry handles it. The orchestrator does NOT
         * pre-generate a flow_id to cross-check — design choice is to let the LLM
         * own this correlation id for now; Plan 07 will reconsider if trace
         * correlation becomes problematic.
         */
        flow_id: plan.flow_id,
      })

      // Plan 06 owns the `refusal.started` schema canonically; this is the agreed stub
      // shape per Plan 02 R-02.23 + Plan 06 cross-reference.
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
          underlying_reason: plan.disambiguation,
        },
      })

      this._safeMetric(() => recordRouterDecision(tenantId, 'disambiguation'))

      return { kind: 'disambiguation', reason: plan.disambiguation, sessionId, parseRetries }
    }

    // Bounded plan — emit audit events per directive (R-02.23a)
    // pinnedSubAgentPromptHashes is passed in from _pipeline — no extra DB call needed.

    // phase1 directives (sequential awaits — single DB client)
    for (const directive of plan.phase1) {
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

    // phase2 directive (optional, sequential await)
    if (plan.phase2) {
      const hash = pinnedSubAgentPromptHashes[plan.phase2.sub_agent_key]
      if (!hash) {
        this.logger.warn(
          `sub_agent_invoked audit: no pinned hash for ${plan.phase2.sub_agent_key} — session may pre-date registration`,
        )
      }
      await this._safeAudit({
        tenantId,
        actorId: userId,
        eventType: 'agent.sub_agent_invoked',
        module: 'agents',
        subjectId: sessionId,
        payload: {
          sub_agent_key: plan.phase2.sub_agent_key,
          phase: 'phase2',
          iteration: null,
          caller_user_id: userId,
          role_key: roleKey,
          turn_trace_id: turnTraceId,
          sub_agent_prompt_hash: hash ?? '',
        },
      })
      this._safeMetric(() => recordSubAgentInvoked(tenantId, plan.phase2!.sub_agent_key, 'phase2'))
    }

    parentSpan?.setAttributes({
      router_parse_retries: parseRetries,
      router_escalated_to_disambiguation: false,
      intent_slug: plan.intent_slug,
      /**
       * flow_id is LLM-generated per-turn. The Zod schema validates UUID format;
       * on format failure the parse retry handles it. The orchestrator does NOT
       * pre-generate a flow_id to cross-check — design choice is to let the LLM
       * own this correlation id for now; Plan 07 will reconsider if trace
       * correlation becomes problematic.
       */
      flow_id: plan.flow_id,
    })

    this._safeMetric(() => recordRouterDecision(tenantId, 'bounded_plan'))

    return { kind: 'bounded', plan, sessionId, parseRetries }
  }

  // ─── Non-critical operation wrappers ─────────────────────────────────────────

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

  // ─── Private helpers ──────────────────────────────────────────────────────────

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
   * At MVP the router uses gpt-4o (plan specifies gpt-5.4; use gpt-4o as actual
   * available model — Plan 12 will wire per-tenant model selection here).
   */
  private _resolveRouterModel(): { provider: 'openai'; model: string } {
    return { provider: 'openai', model: 'gpt-4o' }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _buildFallbackSchemaPrompt(): string {
  const schemaJson = JSON.stringify(ROUTER_PLAN_JSON_SCHEMA_PLACEHOLDER, null, 2)
  return (
    `Your previous response did not match the required RouterPlan schema. ` +
    `Emit only a valid JSON object matching:\n${schemaJson}\n` +
    `No markdown fences. No prose before or after.`
  )
}
