/**
 * ToolGateway — orchestrator that composes the 6 pipeline steps from Task 4 into a
 * single `invoke(input): Promise<ToolGatewayResult>` entrypoint.
 *
 * Responsibilities:
 *  - Phase A: resolve, circuit-breaker check, L1 cache lookup / coalescing.
 *  - Phase B: prepareTaintWrap, ceilingPreCheck, preWriteAbortCheck, register in-flight,
 *             invoke (+ transient single-retry), ceiling budget decrement, applyTaintWrap,
 *             auditEmit, retryCount bookkeeping, circuit-breaker setting.
 *  - Phase C: outermost catch — fail cache handle, audit, return infra_error.
 *
 * Sanitization (R-01.29):
 *  - Audit rows carry raw context (audit trail is sanctuary).
 *  - The Tripwire returned to the caller carries sanitized context (retryHint + safe fields).
 *  - Sanitization is implemented by `sanitizeTripwireContext()` (see below).
 *
 * Circuit-breaker:
 *  - Per R-01.21, ONLY `permission_denied` triggers the circuit-breaker within a turn.
 *  - Ceiling, validation, timeout → retryCount bookkeeping + abort downgrade only.
 *  - This is intentional and documented: once the model receives an `abort` disposition
 *    the model planner should not re-attempt (tool selection is in the model's hands);
 *    the breaker only exists to prevent further expense after permission is confirmed revoked.
 *
 * Transient retry:
 *  - `invoke()` in pipeline-steps already classifies SERVICE_UNAVAILABLE, TOO_MANY_REQUESTS,
 *    and ECONNRESET/ETIMEDOUT network errors as `transient_infra_error` with `retry` disposition.
 *  - The orchestrator detects this variant on the first attempt, waits 200 ms + random jitter
 *    (0–100 ms), retries once. If the retry also returns `transient_infra_error`, returns it
 *    as-is to the caller. If it returns a different variant, handles it normally.
 */

import { Injectable, Logger } from '@nestjs/common'
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
import type { ToolGatewayInvokeInput } from './tool-gateway-contracts'

// ─── Sanitization ─────────────────────────────────────────────────────────────

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
}

/**
 * Variants whose context is structurally safe (no raw error strings) and passes through
 * without modification.
 */
const STRUCTURALLY_SAFE_VARIANTS: ReadonlySet<TripwireVariant> = new Set([
  'procedure_not_agent_exposed',
  'procedure_out_of_sub_agent_scope',
  'abort_pre_write',
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

// ─── Audit status mapping ──────────────────────────────────────────────────────

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
    default:
      return 'infra_error'
  }
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

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

// ─── Jitter helper ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── ToolGateway ─────────────────────────────────────────────────────────────

/**
 * NestJS-injectable ToolGateway orchestrator.
 *
 * Consumers: Plan 03 / 08 AgentRuntime (not yet wired — exported by AgentsModule later).
 */
@Injectable()
export class ToolGateway {
  private readonly logger = new Logger(ToolGateway.name)

  constructor(
    private readonly registry: ToolRegistry,
    // TrpcCallerImpl is injected as the concrete class since TrpcCaller is an interface.
    // The TrpcCaller interface is used for all internal usages and tests; here we accept
    // TrpcCallerImpl which implements it. This avoids needing a DI injection token.
    private readonly caller: TrpcCallerImpl,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  // ─── Public entrypoint ──────────────────────────────────────────────────────

  async invoke(input: ToolGatewayInvokeInput): Promise<ToolGatewayResult> {
    // Phase C outermost guard — unexpected throws must never surface to the caller.
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

  // ─── Inner implementation (separated so Phase C catch can see cacheHandle) ──

  private async invokeInner(
    input: ToolGatewayInvokeInput,
    onCacheHandle: (handle: ReturnType<typeof input.turnState.l1Cache.registerInFlight>) => void,
  ): Promise<ToolGatewayResult> {
    const {
      toolName,
      args,
      subAgentKey: _subAgentKey,
      subAgentScope,
      requestContext,
      abortSignal,
      turnState,
      mode,
    } = input

    // ── Phase A ─────────────────────────────────────────────────────────────

    // Step 1: resolve
    const resolveResult = resolve({ toolName, subAgentScope, registry: this.registry })
    if (isTripwireVariant(resolveResult)) {
      // No audit — tool doesn't exist / out of scope; no audit subject
      return resolveResult
    }
    const { descriptor } = resolveResult

    // Step 2: circuit-breaker check
    const cb = turnState.circuitBreaker.get(descriptor.name)
    if (cb?.permissionDenied) {
      const rawContext = {
        toolName: descriptor.name,
        circuit_broken_at: cb.brokenAt,
      }
      // Audit with raw context (audit is sanctuary), return sanitized
      await auditEmit({
        descriptor,
        requestContext,
        resultStatus: 'permission_denied_disabled',
        extraAttrs: { circuit_broken_at: cb.brokenAt },
        auditFacade: this.auditFacade,
        logger: this.logger,
      })
      return tripwire(
        'permission_denied_disabled',
        'abort',
        sanitizeTripwireContext(rawContext, 'permission_denied_disabled') as Record<
          string,
          unknown
        >,
      )
    }

    if (cb?.ceilingBreached) {
      const rawContext = {
        toolName: descriptor.name,
        circuit_broken_at: cb.brokenAt,
      }
      await auditEmit({
        descriptor,
        requestContext,
        resultStatus: 'ceiling_hit',
        extraAttrs: { circuit_broken: true, circuit_broken_at: cb.brokenAt },
        auditFacade: this.auditFacade,
        logger: this.logger,
      })
      // Use ceiling_breach_bytes as the canonical ceiling variant for the broken-circuit path
      return tripwire(
        'ceiling_breach_bytes',
        'abort',
        sanitizeTripwireContext(
          { ...rawContext, bytesRemaining: 0, wallclockRemaining: 0 },
          'ceiling_breach_bytes',
        ) as Record<string, unknown>,
      )
    }

    // Step 3: L1 cache lookup
    const argsHash = canonicalize(args ?? null).hash
    const cacheHit = turnState.l1Cache.lookup(descriptor.name, argsHash)

    if (cacheHit?.kind === 'completed') {
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
    }

    if (cacheHit?.kind === 'pending') {
      // Coalesce onto the in-flight promise
      try {
        const coalescedResult = await cacheHit.promise
        const { fieldsToWrap: fw } = prepareTaintWrap({ descriptor })
        const { wrappedResult, fieldsWrapped, taintFlipped } = applyTaintWrap({
          result: coalescedResult,
          fieldsToWrap: fw,
          turnState,
        })
        const resultHash = canonicalize(coalescedResult ?? null).hash
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
      } catch (coalescedErr: unknown) {
        const rawMsg = coalescedErr instanceof Error ? coalescedErr.message : String(coalescedErr)
        const rawContext = { toolName: descriptor.name, rawMessage: rawMsg, cache_coalesced: true }
        await auditEmit({
          descriptor,
          requestContext,
          resultStatus: 'infra_error',
          extraAttrs: rawContext,
          auditFacade: this.auditFacade,
          logger: this.logger,
        })
        return tripwire(
          'infra_error',
          'abort',
          sanitizeTripwireContext(rawContext, 'infra_error') as Record<string, unknown>,
        )
      }
    }

    // ── Phase B ─────────────────────────────────────────────────────────────

    // Step 4: prepareTaintWrap
    const { fieldsToWrap } = prepareTaintWrap({ descriptor })

    // Wallclock timer covers everything after resolve — including ceiling checks,
    // pre-write abort, invoke, and any transient-retry jitter sleep. A transient
    // retry's wait counts against the tool's wallclock budget; this is deliberate
    // — the caller experiences that time regardless.
    const startedAt = Date.now()

    // Step 5: ceilingPreCheck
    const ceilingResult = ceilingPreCheck({ descriptor, turnState })
    if (isTripwireVariant(ceilingResult)) {
      // Increment ceiling retry counter
      const ceilingKey = RETRY_KEY.ceiling(descriptor.name)
      const prevCeiling = turnState.retryCount.get(ceilingKey) ?? 0
      turnState.retryCount.set(ceilingKey, prevCeiling + 1)

      // If was already retry-disposition before increment (prevCeiling >= 1), set circuit breaker
      if (prevCeiling >= 1) {
        turnState.circuitBreaker.set(descriptor.name, {
          ceilingBreached: true,
          brokenAt: Date.now(),
        })
      }

      // Audit with raw context (ceiling context is structurally safe — just numbers)
      await auditEmit({
        descriptor,
        requestContext,
        resultStatus: 'ceiling_hit',
        extraAttrs: {
          ...ceilingResult.context,
          circuit_broken: prevCeiling >= 1,
          retryCount: prevCeiling + 1,
        },
        auditFacade: this.auditFacade,
        logger: this.logger,
      })

      // Ceiling context is structurally safe — passes through sanitizer unchanged
      return tripwire(
        ceilingResult.variant,
        ceilingResult.disposition,
        ceilingResult.context as Record<string, unknown>,
      )
    }

    // Step 6: preWriteAbortCheck
    const abortResult = preWriteAbortCheck({ descriptor, abortSignal })
    if (isTripwireVariant(abortResult)) {
      // Per plan §5 "Pre-write abort": NO audit event
      return abortResult
    }

    // Step 7: register in-flight cache entry
    let cacheHandle: ReturnType<typeof turnState.l1Cache.registerInFlight> | undefined
    try {
      cacheHandle = turnState.l1Cache.registerInFlight(descriptor.name, argsHash)
      // Expose the handle to the Phase C catch so it can fail it on unexpected throws
      onCacheHandle(cacheHandle)
    } catch (regErr: unknown) {
      // Double-registration is a programming bug — log and fall through without cache
      this.logger.error(
        `ToolGateway: L1Cache double-registration for tool="${descriptor.name}" — ` +
          `coalescing should have been applied. This is a bug.`,
        regErr instanceof Error ? regErr.stack : String(regErr),
      )
    }

    // Step 8: invoke + optional transient retry
    let invokeResult = await invoke({
      descriptor,
      args,
      requestContext,
      mode,
      caller: this.caller,
    })

    // Single transient retry (200 ms + 0-100 ms jitter)
    if (
      isTripwireVariant(invokeResult) &&
      invokeResult.variant === 'transient_infra_error' &&
      invokeResult.disposition === 'retry'
    ) {
      await sleep(200 + Math.floor(Math.random() * 100))
      invokeResult = await invoke({ descriptor, args, requestContext, mode, caller: this.caller })
    }

    // Step 9: handle invoke result
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
    const { wrappedResult, fieldsWrapped, taintFlipped } = applyTaintWrap({
      result,
      fieldsToWrap,
      turnState,
    })

    const resultHash = canonicalize(result ?? null).hash

    if (cacheHandle) {
      cacheHandle.complete(result)
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

    await auditEmit({
      descriptor,
      requestContext,
      resultStatus: 'success',
      resultHash,
      extraAttrs: { fieldsWrapped, taintFlipped },
      auditFacade: this.auditFacade,
      logger: this.logger,
    })

    return ok(wrappedResult, false)
  }

  // ─── Tripwire handler (invoke failures) ─────────────────────────────────────

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

    // ── Retry-count bookkeeping for retryable variants ───────────────────────
    // Per R-01.21: validation_failed and invocation_timeout are retried once,
    // then downgraded to abort. permission_denied is fixed abort (no retry count).
    //
    // Note: transient_infra_error retry was already consumed by the orchestrator's
    // inline retry above. If we still get transient_infra_error here it means the
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

    // ── Circuit-breaker: only permission_denied (per R-01.21) ────────────────
    if (variant === 'permission_denied') {
      turnState.circuitBreaker.set(descriptor.name, {
        permissionDenied: true,
        brokenAt: Date.now(),
      })
    }

    // ── Audit (raw context) ──────────────────────────────────────────────────
    await auditEmit({
      descriptor: descriptor as Parameters<typeof auditEmit>[0]['descriptor'],
      requestContext,
      resultStatus: variantToAuditStatus(variant),
      extraAttrs: { ...tw.context, disposition: returnedTw.disposition },
      auditFacade: this.auditFacade,
      logger: this.logger,
    })

    // ── Return sanitized tripwire ────────────────────────────────────────────
    const sanitized = sanitizeTripwireContext(tw.context, variant) as Record<string, unknown>

    return tripwire(returnedTw.variant, returnedTw.disposition, sanitized)
  }
}
