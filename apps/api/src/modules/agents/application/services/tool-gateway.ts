/**
 * ToolGateway — orchestrator that composes the pipeline steps into a single
 * `invoke(input): Promise<ToolGatewayResult>` entrypoint.
 *
 * Responsibilities:
 *  - Resolve, circuit-breaker check, L1 cache lookup / coalescing.
 *  - prepareTaintWrap, ceilingPreCheck, preWriteAbortCheck, register in-flight,
 *    invoke (+ transient single-retry), ceiling budget decrement, applyTaintWrap,
 *    auditEmit, retryCount bookkeeping, circuit-breaker setting.
 *  - Outermost catch — fail cache handle, audit, return infra_error.
 *
 * Sanitization:
 *  - Audit rows carry raw context (audit trail is sanctuary).
 *  - The Tripwire returned to the caller carries sanitized context (retryHint + safe fields).
 *  - Sanitization is implemented by `sanitizeTripwireContext()` (see below).
 *
 * Circuit-breaker:
 *  - ONLY `permission_denied` triggers the circuit-breaker within a turn.
 *  - Ceiling, validation, timeout → retryCount bookkeeping + abort downgrade only.
 *  - This is intentional: once the model receives an `abort` disposition the model
 *    planner should not re-attempt (tool selection is in the model's hands); the
 *    breaker only exists to prevent further expense after permission is confirmed
 *    revoked.
 *
 * Transient retry:
 *  - `invoke()` in pipeline-steps already classifies SERVICE_UNAVAILABLE, TOO_MANY_REQUESTS,
 *    and ECONNRESET/ETIMEDOUT network errors as `transient_infra_error` with `retry` disposition.
 *  - The orchestrator detects this variant on the first attempt, waits 200 ms + random jitter
 *    (0–100 ms), retries once. If the retry also returns `transient_infra_error`, returns it
 *    as-is to the caller. If it returns a different variant, handles it normally.
 */

import { Injectable, Logger } from '@nestjs/common'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import {
  resolve,
  prepareTaintWrap,
  ceilingPreCheck,
  preWriteAbortCheck,
  invoke,
  applyTaintWrap,
  auditEmit,
  RETRY_KEY,
} from '../pipeline/pipeline-steps'
import {
  ok,
  tripwire,
  type ToolGatewayResult,
  type Tripwire,
  type TripwireVariant,
} from '../../infrastructure/guards/tripwire'
import { canonicalize } from '../../infrastructure/cache/canonical-args'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { TrpcCallerImpl } from './trpc-caller'
import type { ToolGatewayInvokeInput, ToolGatewayPort } from './tool-gateway-contracts'
import { withGatewayStep, recordStepAttrs } from '../../infrastructure/observability/gateway-spans'
import {
  recordToolCall,
  recordTripwire,
  recordStepDuration,
  recordCacheLookup,
  recordL1Invalidation,
  recordSemanticCacheLookup,
  recordSemanticCacheInvalidationLag,
} from '../../infrastructure/observability/gateway-metrics'
import { FlowPolicyResolver, type EffectivePolicy } from './flow-policy-resolver'
import { DraftProposer } from './draft-proposer'
import type { DraftProposalResult } from './draft-types'
import {
  SemanticResultCache,
  type CacheHit,
} from '../../infrastructure/cache/semantic-result-cache'

const SEMANTIC_CACHE_EMBEDDING_MODEL = 'text-embedding-3-small'
const DEFAULT_SEMANTIC_DISTANCE_THRESHOLD = 0.97

/**
 * Per-variant retry hints shown to the model (not the user or audit log).
 * These are deliberately generic — no raw error text, no field values.
 */
const RETRY_HINTS: Partial<Record<TripwireVariant, string>> = {
  validation_failed: 'correct the argument shape and try again',
  business_rule_violation: 'the operation conflicts with a domain rule; do not retry',
  infra_error: 'an infrastructure error occurred; try a different approach',
  transient_infra_error: 'wait and try again or pick another tool',
  invocation_timeout: 'the tool took too long; reduce scope or wait before retrying',
  ceiling_breach_bytes: 'reduce the query scope — bytes ceiling exhausted for this tool',
  ceiling_breach_wallclock: 'reduce the query scope — wallclock ceiling exhausted for this tool',
  permission_denied: 'you do not have permission to use this tool',
  permission_denied_disabled: 'this tool is disabled for the current turn due to a prior denial',
  policy_violation:
    'this tool performs writes and cannot be executed in a read-only scheduled turn; use a read-only tool instead',
}

/**
 * Variants whose context is structurally safe (no raw error strings) and passes through
 * without modification.
 */
const STRUCTURALLY_SAFE_VARIANTS: ReadonlySet<TripwireVariant> = new Set([
  'procedure_not_agent_exposed',
  'procedure_out_of_sub_agent_scope',
  'abort_pre_write',
  // policy_violation context is { toolName, reason } — no raw error strings, structurally safe.
  'policy_violation',
])

/**
 * Sanitize the tripwire context before returning it to the model.
 *
 * Approach: explicit per-variant retryHint table (lighter-weight than projectToSchema).
 * - Structurally safe variants: pass through untouched.
 * - Ceiling variants: keep toolName + remaining numbers; add retryHint.
 * - All other error variants: keep toolName + errorClass + fieldName (if present, as it is a
 *   schema field name like "planId", not a value); strip rawMessage and trpcCode.
 *
 * The audit row always carries the RAW context. Only the returned Tripwire is sanitized.
 */
export function sanitizeTripwireContext(
  context: Readonly<Record<string, unknown>>,
  variant: TripwireVariant,
): Readonly<Record<string, unknown>> {
  if (STRUCTURALLY_SAFE_VARIANTS.has(variant)) {
    return context
  }

  const retryHint = RETRY_HINTS[variant]

  // Ceiling variants: keep numeric budget fields (safe — no PII)
  if (variant === 'ceiling_breach_bytes' || variant === 'ceiling_breach_wallclock') {
    return Object.freeze({
      toolName: context['toolName'],
      errorClass: variant,
      bytesRemaining: context['bytesRemaining'],
      wallclockRemaining: context['wallclockRemaining'],
      ...(retryHint !== undefined ? { retryHint } : {}),
    })
  }

  // Permission disabled variant: keep circuit_broken_at timestamp (safe)
  if (variant === 'permission_denied_disabled') {
    return Object.freeze({
      toolName: context['toolName'],
      errorClass: variant,
      circuit_broken_at: context['circuit_broken_at'],
      ...(retryHint !== undefined ? { retryHint } : {}),
    })
  }

  // All tRPC-error variants: strip rawMessage + trpcCode; keep toolName, errorClass, fieldName
  const sanitized: Record<string, unknown> = {
    toolName: context['toolName'],
    errorClass: variant,
  }

  // fieldName is a schema field name (e.g. "planId") — safe to forward
  if (typeof context['fieldName'] === 'string') {
    sanitized['fieldName'] = context['fieldName']
  }

  if (retryHint !== undefined) {
    sanitized['retryHint'] = retryHint
  }

  return Object.freeze(sanitized)
}

type AuditResultStatus = Parameters<typeof auditEmit>[0]['resultStatus']

function variantToAuditStatus(variant: TripwireVariant): AuditResultStatus {
  switch (variant) {
    case 'permission_denied':
      return 'permission_denied'
    case 'permission_denied_disabled':
      return 'permission_denied_disabled'
    case 'validation_failed':
      return 'validation_error'
    case 'business_rule_violation':
      return 'business_rule_violation'
    case 'infra_error':
      return 'infra_error'
    case 'transient_infra_error':
      return 'transient_error'
    case 'invocation_timeout':
      return 'timeout'
    case 'ceiling_breach_bytes':
    case 'ceiling_breach_wallclock':
      return 'ceiling_hit'
    case 'abort_pre_write':
      return 'aborted'
    case 'policy_violation':
      return 'policy_violation'
    default:
      return 'infra_error'
  }
}

/**
 * Type-safe tripwire check that works on any `{ kind: string }` union,
 * not just `ToolGatewayResult`. This avoids TS2345 when checking pipeline-step
 * return values whose `{ kind: 'ok', ... }` shape doesn't match `ToolGatewayOk`.
 */
function isTripwireVariant<T extends { kind: string }>(
  r: T,
): r is Extract<T, { kind: 'tripwire' }> {
  return r.kind === 'tripwire'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

@Injectable()
export class ToolGateway implements ToolGatewayPort {
  private readonly logger = new Logger(ToolGateway.name)

  constructor(
    private readonly registry: ToolRegistry,
    // TrpcCallerImpl is injected as the concrete class since TrpcCaller is an interface.
    // The TrpcCaller interface is used for all internal usages and tests; here we accept
    // TrpcCallerImpl which implements it. This avoids needing a DI injection token.
    private readonly caller: TrpcCallerImpl,
    private readonly auditFacade: KernelAuditFacade,
    private readonly flowPolicyResolver: FlowPolicyResolver,
    private readonly draftProposer: DraftProposer,
    private readonly semanticCache: SemanticResultCache,
  ) {}

  async invoke(input: ToolGatewayInvokeInput): Promise<ToolGatewayResult> {
    // Outermost guard — unexpected throws must never surface to the caller.
    // Normal operation never throws: every error path returns a Tripwire.
    // This catch exists only for programming bugs (registry throws, etc.).
    let phaseCCacheHandle: ReturnType<typeof input.turnState.l1Cache.registerInFlight> | undefined

    try {
      return await this.invokeInner(input, (handle) => {
        phaseCCacheHandle = handle
      })
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `ToolGateway Phase C: unexpected throw for tool="${input.toolName}" — this is a bug.`,
        err instanceof Error ? err.stack : rawMsg,
      )

      // Fail any registered in-flight handle to unblock coalesced waiters
      if (phaseCCacheHandle) {
        phaseCCacheHandle.fail(new Error(rawMsg))
      }

      // Attempt audit emit
      const descriptor = this.registry.getDescriptor(input.toolName)
      if (descriptor) {
        await auditEmit({
          descriptor,
          requestContext: input.requestContext,
          resultStatus: 'infra_error',
          extraAttrs: { rawMessage: rawMsg, phase: 'C_unexpected_throw' },
          auditFacade: this.auditFacade,
          logger: this.logger,
        })
      }

      const sanitized = sanitizeTripwireContext(
        { toolName: input.toolName, rawMessage: rawMsg },
        'infra_error',
      )
      return tripwire('infra_error', 'abort', sanitized as Record<string, unknown>)
    }
  }

  // Separated so the outer catch can see cacheHandle.
  private async invokeInner(
    input: ToolGatewayInvokeInput,
    onCacheHandle: (handle: ReturnType<typeof input.turnState.l1Cache.registerInFlight>) => void,
  ): Promise<ToolGatewayResult> {
    const {
      toolName,
      args,
      subAgentKey,
      subAgentScope,
      requestContext,
      abortSignal,
      turnState,
      mode,
      intentSlug,
      flowId,
      userUtterance,
    } = input

    const { tenantId } = requestContext

    // Resolve + cache.
    // Resolve + circuit-breaker check live inside the same gateway:resolve span.
    // The circuit_broken: true attribute must land on this span (for dashboards +
    // trace filtering). The closure returns a tagged union so the outer code branches
    // cleanly without needing to re-check the circuit-breaker state.
    type CbEntry = NonNullable<ReturnType<typeof turnState.circuitBreaker.get>>

    const resolveStepStart = Date.now()
    const resolveOutcome = await withGatewayStep(
      'resolve',
      { tool_name: toolName, sub_agent_key: subAgentKey },
      ():
        | { kind: 'resolve_error'; tw: Tripwire }
        | { kind: 'circuit_broken'; descriptor: AgentToolDescriptor; cb: CbEntry }
        | { kind: 'ok'; descriptor: AgentToolDescriptor } => {
        const resolveResult = resolve({ toolName, subAgentScope, registry: this.registry })
        if (isTripwireVariant(resolveResult)) {
          return { kind: 'resolve_error', tw: resolveResult }
        }
        const cb = turnState.circuitBreaker.get(resolveResult.descriptor.name)
        if (cb?.permissionDenied) {
          recordStepAttrs({ circuit_broken: true, cb_reason: 'permission_denied' })
          return { kind: 'circuit_broken', descriptor: resolveResult.descriptor, cb }
        }
        if (cb?.ceilingBreached) {
          recordStepAttrs({ circuit_broken: true, cb_reason: 'ceiling_breached' })
          return { kind: 'circuit_broken', descriptor: resolveResult.descriptor, cb }
        }
        return { kind: 'ok', descriptor: resolveResult.descriptor }
      },
    )
    recordStepDuration('resolve', Date.now() - resolveStepStart)

    if (resolveOutcome.kind === 'resolve_error') {
      // No audit — tool doesn't exist / out of scope; no audit subject.
      // procedure_not_agent_exposed / procedure_out_of_sub_agent_scope are not
      // attributable to a tenant tool call so we skip recordToolCall here.
      // However, we DO record the tripwire metric — these are load-bearing
      // attack-telemetry signals (jailbreak probes, router drift, model hallucinating
      // tool names). The metric carries no PII (variant + disposition are static).
      recordTripwire(
        requestContext.tenantId,
        resolveOutcome.tw.variant,
        resolveOutcome.tw.disposition,
      )
      return resolveOutcome.tw
    }

    if (resolveOutcome.kind === 'circuit_broken') {
      const { descriptor, cb } = resolveOutcome
      if (cb.permissionDenied) {
        const rawContext = {
          toolName: descriptor.name,
          circuit_broken_at: cb.brokenAt,
        }
        // Audit with raw context (audit is sanctuary), return sanitized
        const auditStart = Date.now()
        const auditResult = await withGatewayStep(
          'audit-emit',
          { result_status: 'permission_denied_disabled', audit_row_id: undefined },
          () =>
            auditEmit({
              descriptor,
              requestContext,
              resultStatus: 'permission_denied_disabled',
              extraAttrs: { circuit_broken_at: cb.brokenAt },
              auditFacade: this.auditFacade,
              logger: this.logger,
            }),
        )
        recordStepDuration('audit-emit', Date.now() - auditStart)
        void auditResult // result not needed here
        const tw = tripwire(
          'permission_denied_disabled',
          'abort',
          sanitizeTripwireContext(rawContext, 'permission_denied_disabled') as Record<
            string,
            unknown
          >,
        )
        recordToolCall(tenantId, descriptor.name, 'permission_denied_disabled')
        recordTripwire(tenantId, 'permission_denied_disabled', 'abort')
        return tw
      } else {
        // ceilingBreached
        const rawContext = {
          toolName: descriptor.name,
          circuit_broken_at: cb.brokenAt,
        }
        const auditStart = Date.now()
        await withGatewayStep(
          'audit-emit',
          { result_status: 'ceiling_hit', audit_row_id: undefined },
          () =>
            auditEmit({
              descriptor,
              requestContext,
              resultStatus: 'ceiling_hit',
              extraAttrs: { circuit_broken: true, circuit_broken_at: cb.brokenAt },
              auditFacade: this.auditFacade,
              logger: this.logger,
            }),
        )
        recordStepDuration('audit-emit', Date.now() - auditStart)
        // Use the variant that originally tripped the breaker so the model receives
        // the correct retry hint (bytes vs wallclock scope reduction).
        // Fallback to 'ceiling_breach_bytes' is a safety net for pre-extension entries
        // that pre-date the breachedVariant field.
        const ceilingVariant = cb.breachedVariant ?? 'ceiling_breach_bytes'
        const tw = tripwire(
          ceilingVariant,
          'abort',
          sanitizeTripwireContext(
            { ...rawContext, bytesRemaining: 0, wallclockRemaining: 0 },
            ceilingVariant,
          ) as Record<string, unknown>,
        )
        recordToolCall(tenantId, descriptor.name, 'ceiling_hit')
        recordTripwire(tenantId, ceilingVariant, 'abort')
        return tw
      }
    }

    const { descriptor } = resolveOutcome

    // Read-only policy envelope: refuse mutation tools for direct dispatch.
    // Enforced at the worker/gateway boundary BEFORE ceiling pre-check so the cost
    // meter never starts on a refused mutation call.
    // Draft-creation is NOT refused here because drafts are proposals; the actual
    // write happens at approval time. Only direct `mutation` procedure execution is
    // refused under a read-only policy.
    if (input.policy.readOnly === true && descriptor.procedure === 'mutation') {
      const rawContext = { toolName: descriptor.name, reason: 'read_only_policy' }
      const auditStart = Date.now()
      await withGatewayStep(
        'audit-emit',
        { result_status: 'policy_violation', audit_row_id: undefined },
        () =>
          auditEmit({
            descriptor,
            requestContext,
            resultStatus: 'policy_violation',
            extraAttrs: { policy: 'read_only', reason: 'mutation_refused_under_read_only_policy' },
            auditFacade: this.auditFacade,
            logger: this.logger,
          }),
      )
      recordStepDuration('audit-emit', Date.now() - auditStart)
      recordToolCall(tenantId, descriptor.name, 'policy_violation')
      recordTripwire(tenantId, 'policy_violation', 'abort')
      return tripwire('policy_violation', 'abort', rawContext)
    }

    // Domain allowlist check for mutation tools.
    // `people.*` mutations are gated behind `feature.agent.people_writes` (default off).
    // `planner.*` and `projects.*` are enabled day-1.
    // Non-whitelisted domains reject BEFORE tier classification.
    if (descriptor.procedure === 'mutation') {
      const domainPrefix = descriptor.name.split('.')[0] ?? ''
      if (domainPrefix === 'people' && !input.policy.agentPeopleWritesEnabled) {
        const rawContext = { toolName: descriptor.name, reason: 'people_writes_disabled' }
        const auditStart = Date.now()
        await withGatewayStep(
          'audit-emit',
          { result_status: 'policy_violation', audit_row_id: undefined },
          () =>
            auditEmit({
              descriptor,
              requestContext,
              resultStatus: 'policy_violation',
              extraAttrs: {
                policy: 'people_writes_disabled',
                reason: 'feature.agent.people_writes_flag_off',
              },
              auditFacade: this.auditFacade,
              logger: this.logger,
            }),
        )
        recordStepDuration('audit-emit', Date.now() - auditStart)
        recordToolCall(tenantId, descriptor.name, 'policy_violation')
        recordTripwire(tenantId, 'policy_violation', 'abort')
        return tripwire('policy_violation', 'abort', rawContext)
      }
    }

    // Flow-policy resolution — inserted between Resolve and Ceiling pre-check.
    // Only run for mutation tools; queries have no approval-freshness semantics.
    // Result is used later in the mutation success path to pass effective TTL to DraftProposer.
    let effectivePolicy: EffectivePolicy | undefined
    if (descriptor.procedure === 'mutation') {
      effectivePolicy = this.flowPolicyResolver.resolve(intentSlug ?? '', descriptor.meta)
    }

    // Protocol: a caller passing `undefined` (no arg) is treated as `null` for hashing
    // purposes. canonicalize() explicitly rejects top-level `undefined`.
    // Using an explicit ternary makes the coercion visible and intentional; `?? null`
    // was too easy to read as "null if falsy" which would also collapse `0` and `''`.
    const argsForHash = args === undefined ? null : args
    const argsHash = canonicalize(argsForHash).hash
    const cacheHit = turnState.l1Cache.lookup(descriptor.name, argsHash)

    if (cacheHit?.kind === 'completed') {
      recordCacheLookup(tenantId, descriptor.name, 'hit')
      const cacheHitStart = Date.now()
      const cacheHitResult = await withGatewayStep(
        'cache-hit',
        { cached_args_hash: argsHash, cache_outcome: 'completed' },
        async () => {
          const { fieldsToWrap: fw } = prepareTaintWrap({ descriptor })
          const { wrappedResult, fieldsWrapped, taintFlipped } = applyTaintWrap({
            result: cacheHit.result,
            fieldsToWrap: fw,
            turnState,
          })
          await auditEmit({
            descriptor,
            requestContext,
            resultStatus: 'success',
            resultHash: cacheHit.resultHash,
            extraAttrs: { fromCache: true, fieldsWrapped, taintFlipped },
            auditFacade: this.auditFacade,
            logger: this.logger,
          })
          return ok(wrappedResult, true)
        },
      )
      recordStepDuration('cache-hit', Date.now() - cacheHitStart)
      recordToolCall(tenantId, descriptor.name, 'success')
      return cacheHitResult
    }

    if (cacheHit?.kind === 'pending') {
      recordCacheLookup(tenantId, descriptor.name, 'coalesced')
      const cacheHitStart = Date.now()
      // Coalesce onto the in-flight promise
      try {
        const coalescedResult = await withGatewayStep(
          'cache-hit',
          { cached_args_hash: argsHash, cache_outcome: 'coalesced' },
          async () => {
            const resolved = await cacheHit.promise
            const { fieldsToWrap: fw } = prepareTaintWrap({ descriptor })
            const { wrappedResult, fieldsWrapped, taintFlipped } = applyTaintWrap({
              result: resolved,
              fieldsToWrap: fw,
              turnState,
            })
            const resultHash = canonicalize(resolved ?? null).hash
            await auditEmit({
              descriptor,
              requestContext,
              resultStatus: 'success',
              resultHash,
              extraAttrs: { fromCache: true, cache_coalesced: true, fieldsWrapped, taintFlipped },
              auditFacade: this.auditFacade,
              logger: this.logger,
            })
            return ok(wrappedResult, true)
          },
        )
        recordStepDuration('cache-hit', Date.now() - cacheHitStart)
        recordToolCall(tenantId, descriptor.name, 'success')
        return coalescedResult
      } catch (coalescedErr: unknown) {
        recordStepDuration('cache-hit', Date.now() - cacheHitStart)
        const rawMsg = coalescedErr instanceof Error ? coalescedErr.message : String(coalescedErr)
        // The waiter did not execute the call — the error belongs to the primary.
        // Do NOT include rawMessage in the waiter's audit row; the primary's audit row
        // already carries the full error. cache_coalesced: true directs an operator to
        // find the primary's row via the shared cache key + timestamp window.
        const rawContext = {
          toolName: descriptor.name,
          cache_coalesced: true,
          fromCache: true,
        }
        // Still log the raw message locally for debugging (does not reach the audit trail).
        this.logger.error(
          `ToolGateway: coalesced waiter received primary error for tool="${descriptor.name}"`,
          rawMsg,
        )
        await auditEmit({
          descriptor,
          requestContext,
          resultStatus: 'infra_error',
          extraAttrs: rawContext,
          auditFacade: this.auditFacade,
          logger: this.logger,
        })
        const tw = tripwire(
          'infra_error',
          'abort',
          sanitizeTripwireContext(rawContext, 'infra_error') as Record<string, unknown>,
        )
        recordToolCall(tenantId, descriptor.name, 'infra_error')
        recordTripwire(tenantId, 'infra_error', 'abort')
        return tw
      }
    }

    // Cache miss
    recordCacheLookup(tenantId, descriptor.name, 'miss')

    // Semantic cache check — after L1 miss, before ceiling pre-check.
    if (descriptor.meta.cacheable) {
      const semanticCacheStart = Date.now()
      let semanticHit: CacheHit | undefined
      try {
        semanticHit = await withGatewayStep(
          'semantic-cache',
          { tool_name: descriptor.name, cached_args_hash: argsHash },
          async () => {
            return this.semanticCache.get({
              tenantId,
              toolName: descriptor.name,
              args: argsForHash,
              embeddingModel: SEMANTIC_CACHE_EMBEDDING_MODEL,
              distanceThreshold:
                descriptor.meta.cacheable!.distanceThreshold ?? DEFAULT_SEMANTIC_DISTANCE_THRESHOLD,
            })
          },
        )
      } catch {
        // Fail-open: if withGatewayStep throws (shouldn't happen), proceed without semantic cache
        semanticHit = undefined
      }
      recordStepDuration('semantic-cache', Date.now() - semanticCacheStart)

      if (semanticHit) {
        recordSemanticCacheLookup(tenantId, descriptor.name, semanticHit.hitKind)
        // Taint-wrap and audit the cached hit
        const { fieldsToWrap: fw } = prepareTaintWrap({ descriptor })
        const { wrappedResult, fieldsWrapped, taintFlipped } = applyTaintWrap({
          result: semanticHit.result,
          fieldsToWrap: fw,
          turnState,
        })
        await auditEmit({
          descriptor,
          requestContext,
          resultStatus: 'success',
          extraAttrs: {
            fromSemanticCache: true,
            cacheHitKind: semanticHit.hitKind,
            fieldsWrapped,
            taintFlipped,
          },
          auditFacade: this.auditFacade,
          logger: this.logger,
        })
        recordToolCall(tenantId, descriptor.name, 'success')
        return ok(wrappedResult, false)
      } else {
        recordSemanticCacheLookup(tenantId, descriptor.name, 'miss')
      }
    }

    // Invoke + cache write.
    // prepareTaintWrap is a pure sync step; called directly (no await) to preserve
    // the cache-coalescing timing guarantee. The L1 cache's registerInFlight call
    // below must happen in the same microtask as the cache-miss decision so a
    // concurrent second call sees the in-flight entry when it calls lookup().
    // Awaiting any Promise here would yield a tick and break coalescing. The span
    // is emitted inline via withGatewayStep without await; since prepareTaintWrap
    // is sync, the span body runs synchronously and fieldsToWrap is captured via
    // the closure.
    const taintWrapSetupStart = Date.now()
    let fieldsToWrap: ReadonlyArray<string> = []
    // Fire-and-forget the Promise; the sync body runs immediately due to
    // withGatewayStep's synchronous execution of sync fns inside context.with.
    // The .catch() is defensive: current sync steps do not throw, but any future
    // change that adds a throw path would otherwise produce a silent unhandled
    // rejection. queueMicrotask(throw) surfaces the error loudly (triggers Node's
    // unhandled-rejection handler) without yielding a microtask before
    // registerInFlight, preserving the L1 cache coalescing race-freedom guarantee.
    withGatewayStep('taint-wrap-setup', {}, () => {
      const r = prepareTaintWrap({ descriptor })
      fieldsToWrap = r.fieldsToWrap
      recordStepAttrs({ fields_to_wrap: [...r.fieldsToWrap] })
      return r
    }).catch((err) => {
      queueMicrotask(() => {
        throw err
      })
    })
    recordStepDuration('taint-wrap-setup', Date.now() - taintWrapSetupStart)

    // Wallclock timer covers everything after resolve — including ceiling checks,
    // pre-write abort, invoke, and any transient-retry jitter sleep. A transient
    // retry's wait counts against the tool's wallclock budget; this is deliberate
    // — the caller experiences that time regardless.
    const startedAt = Date.now()

    // ceilingPreCheck is a pure sync step; span emitted inline (no await) to
    // preserve coalescing timing. See taint-wrap-setup comment above.
    let ceilingResult: ReturnType<typeof ceilingPreCheck> | undefined
    const ceilingCheckStart = Date.now()
    withGatewayStep('ceiling-check', {}, () => {
      const r = ceilingPreCheck({ descriptor, turnState })
      ceilingResult = r
      // Record budget attrs mid-step onto the active span (ceiling-check span)
      if (r.kind === 'ok') {
        const rem = r.remaining
        recordStepAttrs({
          bytes_remaining: rem.bytes ?? -1,
          wallclock_remaining: rem.wallclockMs ?? -1,
          breach: false,
        })
      } else {
        // Tripwire — record breach attrs before the span helper annotates tripwire_variant.
        // Cast to number: bytesRemaining / wallclockRemaining are numbers or null in context;
        // -1 is a sentinel for "not applicable" to satisfy AttributeValue (no null).
        const ctx = r.context as Record<string, unknown>
        recordStepAttrs({
          bytes_remaining: typeof ctx['bytesRemaining'] === 'number' ? ctx['bytesRemaining'] : -1,
          wallclock_remaining:
            typeof ctx['wallclockRemaining'] === 'number' ? ctx['wallclockRemaining'] : -1,
          breach: true,
        })
      }
      return r
    }).catch((err) => {
      queueMicrotask(() => {
        throw err
      })
    })
    recordStepDuration('ceiling-check', Date.now() - ceilingCheckStart)
    // ceilingResult is guaranteed set (synchronous fn)

    if (isTripwireVariant(ceilingResult!)) {
      const ceilingTw = ceilingResult!

      // Increment ceiling retry counter
      const ceilingKey = RETRY_KEY.ceiling(descriptor.name)
      const prevCeiling = turnState.retryCount.get(ceilingKey) ?? 0
      turnState.retryCount.set(ceilingKey, prevCeiling + 1)

      // If was already retry-disposition before increment (prevCeiling >= 1), set circuit breaker.
      // Record the specific variant so the re-invocation tripwire uses the correct ceiling variant
      // (bytes vs wallclock) rather than defaulting to bytes for all ceiling breaches.
      if (prevCeiling >= 1) {
        turnState.circuitBreaker.set(descriptor.name, {
          ceilingBreached: true,
          breachedVariant: ceilingTw.variant as 'ceiling_breach_bytes' | 'ceiling_breach_wallclock',
          brokenAt: Date.now(),
        })
      }

      // Audit with raw context (ceiling context is structurally safe — just numbers)
      const auditStart = Date.now()
      await withGatewayStep(
        'audit-emit',
        { result_status: 'ceiling_hit', audit_row_id: undefined },
        () =>
          auditEmit({
            descriptor,
            requestContext,
            resultStatus: 'ceiling_hit',
            extraAttrs: {
              ...ceilingTw.context,
              circuit_broken: prevCeiling >= 1,
              retryCount: prevCeiling + 1,
            },
            auditFacade: this.auditFacade,
            logger: this.logger,
          }),
      )
      recordStepDuration('audit-emit', Date.now() - auditStart)

      const tw = tripwire(
        ceilingTw.variant,
        ceilingTw.disposition,
        ceilingTw.context as Record<string, unknown>,
      )
      recordToolCall(tenantId, descriptor.name, 'ceiling_hit')
      recordTripwire(tenantId, ceilingTw.variant, ceilingTw.disposition)
      return tw
    }

    // preWriteAbortCheck is a pure sync step; span emitted inline (no await).
    // Mutations get a gateway:pre-write-abort-check span; queries skip the span
    // entirely (only mutations need pre-write abort tracing).
    if (descriptor.procedure === 'mutation') {
      let abortResult: ReturnType<typeof preWriteAbortCheck> | undefined
      const abortCheckStart = Date.now()
      withGatewayStep('pre-write-abort-check', {}, () => {
        const r = preWriteAbortCheck({ descriptor, abortSignal })
        abortResult = r
        if (isTripwireVariant(r)) {
          recordStepAttrs({ aborted: true })
        }
        return r
      }).catch((err) => {
        queueMicrotask(() => {
          throw err
        })
      })
      recordStepDuration('pre-write-abort-check', Date.now() - abortCheckStart)

      if (isTripwireVariant(abortResult!)) {
        // Pre-write abort emits NO audit event by design.
        recordToolCall(tenantId, descriptor.name, 'aborted')
        recordTripwire(tenantId, 'abort_pre_write', 'abort')
        return abortResult!
      }
    } else {
      // Query: check abort signal without emitting a span (queries skip pre-write spans).
      const abortResult = preWriteAbortCheck({ descriptor, abortSignal })
      if (isTripwireVariant(abortResult)) {
        return abortResult
      }
    }

    let cacheHandle: ReturnType<typeof turnState.l1Cache.registerInFlight> | undefined
    try {
      cacheHandle = turnState.l1Cache.registerInFlight(descriptor.name, argsHash)
      // Expose the handle to the outer catch so it can fail it on unexpected throws
      onCacheHandle(cacheHandle)
    } catch (regErr: unknown) {
      // Double-registration is a programming bug — log and fall through without cache
      this.logger.error(
        `ToolGateway: L1Cache double-registration for tool="${descriptor.name}" — ` +
          `coalescing should have been applied. This is a bug.`,
        regErr instanceof Error ? regErr.stack : String(regErr),
      )
    }

    // Each invoke attempt (including retry) gets its own gateway:invoke span — the
    // retry IS a new invocation attempt, distinct trace subtree.
    let retryCount = 0
    const invokeStep = async () => {
      const invokeStart = Date.now()
      const result = await withGatewayStep(
        'invoke',
        {
          tool_name: descriptor.name,
          sub_agent_key: subAgentKey,
          retry_count: retryCount,
          cached_args_hash: argsHash,
        },
        () => invoke({ descriptor, args, requestContext, mode, caller: this.caller }),
      )
      recordStepDuration('invoke', Date.now() - invokeStart)
      return result
    }

    let invokeResult = await invokeStep()

    // Single transient retry (200 ms + 0-100 ms jitter)
    if (
      isTripwireVariant(invokeResult) &&
      invokeResult.variant === 'transient_infra_error' &&
      invokeResult.disposition === 'retry'
    ) {
      retryCount = 1
      await sleep(200 + Math.floor(Math.random() * 100))
      invokeResult = await invokeStep()
    }

    if (isTripwireVariant(invokeResult)) {
      // Fail the cache handle — releases coalesced waiters
      if (cacheHandle) {
        const rawMsg =
          typeof invokeResult.context['rawMessage'] === 'string'
            ? invokeResult.context['rawMessage']
            : `${invokeResult.variant} error`
        cacheHandle.fail(new Error(rawMsg))
      }

      return this.handleInvokeTripwire(invokeResult, descriptor, requestContext, turnState)
    }

    // On ok: apply taint wrap, complete cache handle, decrement ceiling, audit
    const { result } = invokeResult

    const taintWrapResultStart = Date.now()
    const { wrappedResult, fieldsWrapped, taintFlipped } = await withGatewayStep(
      'taint-wrap-result',
      {},
      () => {
        const wrapped = applyTaintWrap({ result, fieldsToWrap, turnState })
        recordStepAttrs({
          fields_wrapped: [...wrapped.fieldsWrapped],
          taint_flipped: wrapped.taintFlipped,
        })
        return wrapped
      },
    )
    recordStepDuration('taint-wrap-result', Date.now() - taintWrapResultStart)

    const resultHash = canonicalize(result ?? null).hash

    if (cacheHandle) {
      cacheHandle.complete(result)
    }

    // Semantic cache put — fire-and-forget, only for cacheable tools.
    if (descriptor.meta.cacheable) {
      void this.semanticCache
        .put({
          tenantId,
          toolName: descriptor.name,
          args: argsForHash,
          result,
          ttlSeconds: descriptor.meta.cacheable.ttlSeconds,
          embeddingModel: SEMANTIC_CACHE_EMBEDDING_MODEL,
        })
        .catch((err: unknown) => {
          this.logger.error(
            `ToolGateway: semantic cache put failed for tool="${descriptor.name}"`,
            err instanceof Error ? err.stack : String(err),
          )
        })
    }

    // Module-scoped L1 cache invalidation on mutation success.
    // A write call to `<module>.<op>` invalidates all cached reads matching
    // `<module>.*` in this sub-agent's turn cache. Cross-module writes do NOT
    // cascade — only the first dot-segment is used as the prefix.
    if (descriptor.procedure === 'mutation') {
      const modulePrefix = descriptor.name.split('.')[0]
      if (modulePrefix) {
        turnState.l1Cache.invalidate(modulePrefix)
        recordL1Invalidation(subAgentKey, modulePrefix)

        // Semantic cache domain invalidation — fire-and-forget.
        const invalidateStart = Date.now()
        void this.semanticCache
          .invalidateDomain({ tenantId, domain: modulePrefix })
          .then(({ purgedCount: _count }) => {
            recordSemanticCacheInvalidationLag(Date.now() - invalidateStart)
          })
          .catch((err: unknown) => {
            this.logger.error(
              `ToolGateway: semantic cache invalidateDomain failed for domain="${modulePrefix}"`,
              err instanceof Error ? err.stack : String(err),
            )
          })
      }
    }

    // Ceiling budget decrement
    const elapsed = Date.now() - startedAt
    const existingRemaining = turnState.toolCeilingRemaining.get(descriptor.name)
    if (existingRemaining !== undefined || descriptor.meta.ceilings) {
      const current = existingRemaining ?? {
        bytes: descriptor.meta.ceilings?.bytesScanned,
        wallclockMs: descriptor.meta.ceilings?.wallclockMs,
      }
      const resultBytes = JSON.stringify(result).length
      turnState.toolCeilingRemaining.set(descriptor.name, {
        bytes: current.bytes !== undefined ? current.bytes - resultBytes : undefined,
        wallclockMs: current.wallclockMs !== undefined ? current.wallclockMs - elapsed : undefined,
      })
    }

    const auditEmitStart = Date.now()
    await withGatewayStep(
      'audit-emit',
      {
        result_status: 'success',
        // DEFERRED: audit_row_id will be available once Plan 07 exposes the
        // audit record ID via KernelAuditFacade. Until then, set to null.
        audit_row_id: undefined,
      },
      () =>
        auditEmit({
          descriptor,
          requestContext,
          resultStatus: 'success',
          resultHash,
          extraAttrs: { fieldsWrapped, taintFlipped },
          auditFacade: this.auditFacade,
          logger: this.logger,
        }),
    )
    recordStepDuration('audit-emit', Date.now() - auditEmitStart)

    recordToolCall(tenantId, descriptor.name, 'success')

    // DraftProposer hookup: called on mutation tool success.
    // Resilience contract: a DraftProposer failure is non-fatal — the tool call
    // already succeeded and the audit row is written. Log the error and return
    // without a draft rather than surfacing an infra_error to the caller.
    let draft: DraftProposalResult | undefined
    if (descriptor.procedure === 'mutation') {
      try {
        draft = await this.draftProposer.propose({
          toolDescriptor: descriptor,
          toolName: descriptor.name,
          args,
          turnState,
          tenantId,
          traceId: requestContext.traceId,
          flowId: flowId ?? '',
          initiatorUserId: requestContext.userId,
          approvalTtlHours: effectivePolicy?.approvalTtlHours,
          approvalFreshness: effectivePolicy?.approvalFreshness,
          summary: `Draft action: ${descriptor.name}`,
          userUtterance,
        })
      } catch (draftErr: unknown) {
        this.logger.error(
          `ToolGateway: DraftProposer.propose() failed for tool="${descriptor.name}" — ` +
            `draft not created but tool call succeeded.`,
          draftErr instanceof Error ? draftErr.stack : String(draftErr),
        )
      }
    }

    return ok(wrappedResult, false, draft)
  }

  /**
   * Handles a Tripwire returned by `invoke()` (post-retry):
   * - Retry-count bookkeeping for retryable variants.
   * - Circuit-breaker set for permission_denied.
   * - Audit emit (raw context — audit is sanctuary).
   * - Return sanitized tripwire to caller.
   */
  private async handleInvokeTripwire(
    tw: Tripwire,
    descriptor: { name: string; permission: string; meta: { ceilings?: unknown } },
    requestContext: Parameters<typeof auditEmit>[0]['requestContext'],
    turnState: ToolGatewayInvokeInput['turnState'],
  ): Promise<Tripwire> {
    const { variant } = tw
    const { tenantId } = requestContext

    // Retry-count bookkeeping: validation_failed and invocation_timeout are retried
    // once, then downgraded to abort. permission_denied is fixed abort (no retry
    // count). transient_infra_error retry was already consumed by the orchestrator's
    // inline retry above; if we still get transient_infra_error here it means the
    // retry was also transient — return as-is (already disposition: 'retry').

    let returnedTw: Tripwire = tw

    if (variant === 'validation_failed' || variant === 'invocation_timeout') {
      const retryKey =
        variant === 'validation_failed'
          ? RETRY_KEY.validation(descriptor.name)
          : RETRY_KEY.timeout(descriptor.name)
      const prev = turnState.retryCount.get(retryKey) ?? 0
      turnState.retryCount.set(retryKey, prev + 1)

      // Downgrade to abort if already retried once (prev >= 1 means this is second+ attempt)
      if (prev >= 1) {
        // Construct a new tripwire with the same variant but 'abort' disposition.
        // Note: validation_failed and invocation_timeout are NOT in FIXED_ABORT_VARIANTS,
        // so we can construct them with 'abort'.
        returnedTw = tripwire(variant, 'abort', tw.context as Record<string, unknown>)
      }
    }

    // Circuit-breaker is only triggered by permission_denied; other variants
    // produce abort dispositions but do not break the circuit.
    if (variant === 'permission_denied') {
      turnState.circuitBreaker.set(descriptor.name, {
        permissionDenied: true,
        brokenAt: Date.now(),
      })
    }

    // Audit row carries raw context (audit is sanctuary); the returned tripwire
    // is sanitized below.
    const auditStatus = variantToAuditStatus(variant)
    const auditStart = Date.now()
    await withGatewayStep(
      'audit-emit',
      {
        result_status: auditStatus,
        // DEFERRED: audit_row_id will be available once Plan 07 exposes the
        // audit record ID via KernelAuditFacade. Until then, set to null.
        audit_row_id: undefined,
      },
      () =>
        auditEmit({
          descriptor: descriptor as Parameters<typeof auditEmit>[0]['descriptor'],
          requestContext,
          resultStatus: auditStatus,
          extraAttrs: { ...tw.context, disposition: returnedTw.disposition },
          auditFacade: this.auditFacade,
          logger: this.logger,
        }),
    )
    recordStepDuration('audit-emit', Date.now() - auditStart)

    recordToolCall(tenantId, descriptor.name, auditStatus)
    recordTripwire(tenantId, returnedTw.variant, returnedTw.disposition)

    const sanitized = sanitizeTripwireContext(tw.context, variant) as Record<string, unknown>

    return tripwire(returnedTw.variant, returnedTw.disposition, sanitized)
  }
}
