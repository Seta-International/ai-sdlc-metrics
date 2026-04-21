/**
 * ToolGateway Pipeline Steps — Task 4 (plan 01).
 *
 * Each step is a pure function (or thin async wrapper). Steps return either a
 * step-specific continuation object or a `Tripwire`. The orchestrator (Task 5)
 * composes steps, manages spans, circuit-breaker state, and retry bookkeeping.
 *
 * Non-goals for this file:
 *  - L1 cache interaction (orchestrator owns it)
 *  - Span creation (Task 6)
 *  - Retry loops (orchestrator)
 *  - Sanitization of error context (orchestrator applies projectToSchema before handing to sub-agent)
 *  - Dependency injection (all steps are plain functions)
 */

import { TRPCError } from '@trpc/server'
import type { Logger } from '@nestjs/common'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import { permissionMatchesAnyPrefix } from '../../infrastructure/tool-registry/permission-match'
import type { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import type { RequestContext, TurnState } from '../services/tool-gateway-contracts'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { tripwire, type Tripwire } from '../../infrastructure/guards/tripwire'

// ─── Retry-key helpers ────────────────────────────────────────────────────────

/**
 * Canonical retry-key factory used by both `ceilingPreCheck` (pipeline) and the
 * ToolGateway orchestrator. Centralised here to avoid key-string drift between the
 * two sites.
 */
export const RETRY_KEY = {
  ceiling: (toolName: string) => `${toolName}:ceiling`,
  validation: (toolName: string) => `${toolName}:validation`,
  timeout: (toolName: string) => `${toolName}:timeout`,
} as const

// ─── Step 1 — resolve ─────────────────────────────────────────────────────────

/**
 * Resolves a tool name to its descriptor, enforcing sub-agent scope.
 *
 * Returns:
 *  - `{ kind: 'ok', descriptor }` when the tool exists and is in scope.
 *  - `Tripwire 'procedure_not_agent_exposed'` when the tool is not registered.
 *  - `Tripwire 'procedure_out_of_sub_agent_scope'` when the tool exists but
 *    its permission is not covered by any prefix in `subAgentScope`.
 */
export function resolve(input: {
  toolName: string
  subAgentScope: ReadonlyArray<string>
  registry: ToolRegistry
}): { kind: 'ok'; descriptor: AgentToolDescriptor } | Tripwire {
  const { toolName, subAgentScope, registry } = input

  const descriptor = registry.getDescriptor(toolName)
  if (descriptor === undefined) {
    return tripwire('procedure_not_agent_exposed', 'abort', { toolName })
  }

  if (!permissionMatchesAnyPrefix(descriptor.permission, subAgentScope)) {
    return tripwire('procedure_out_of_sub_agent_scope', 'abort', {
      toolName,
      permission: descriptor.permission,
    })
  }

  return { kind: 'ok', descriptor }
}

// ─── Step 2 — prepareTaintWrap ────────────────────────────────────────────────

/**
 * Extracts the list of field names that should be wrapped with tenant-authored
 * delimiters before the result is handed to the sub-agent LLM context.
 *
 * No tripwire possible — this is purely informational.
 *
 * The actual wrapping is performed in Step 6a (`applyTaintWrap`).
 * This step MUST run for every tool call so the orchestrator can emit the
 * `gateway:taint-wrap-setup` span (Task 6) even when there is nothing to wrap.
 */
export function prepareTaintWrap(input: { descriptor: AgentToolDescriptor }): {
  fieldsToWrap: ReadonlyArray<string>
} {
  const { tenantAuthoredFreeText } = input.descriptor.meta
  if (!tenantAuthoredFreeText || tenantAuthoredFreeText.length === 0) {
    return { fieldsToWrap: [] }
  }
  return { fieldsToWrap: tenantAuthoredFreeText }
}

// ─── Step 3 — ceilingPreCheck ─────────────────────────────────────────────────

/**
 * Reads the current ceiling budget for this tool and tripwires if the budget
 * is already exhausted BEFORE invoking the tool.
 *
 * Disposition logic:
 *  - First breach (retryCount for the ceiling key is undefined or 0) → `retry`
 *    so the orchestrator can attempt to recover (e.g. by not calling this tool).
 *  - Second+ breach (retryCount >= 1) → `abort` (per §5 Retry-counting).
 *
 * The orchestrator (Task 5) owns decrementing the ceiling budget after a
 * successful invocation and incrementing the retry counter after each breach.
 * This step only reads — it never mutates TurnState.
 */
export function ceilingPreCheck(input: {
  descriptor: AgentToolDescriptor
  turnState: TurnState
}): { kind: 'ok'; remaining: { bytes?: number; wallclockMs?: number } } | Tripwire {
  const { descriptor, turnState } = input

  if (!descriptor.meta.ceilings) {
    return { kind: 'ok', remaining: { bytes: Infinity, wallclockMs: Infinity } }
  }

  // Seed remaining from descriptor if not yet tracked for this tool
  let remaining = turnState.toolCeilingRemaining.get(descriptor.name)
  if (remaining === undefined) {
    remaining = {
      bytes: descriptor.meta.ceilings.bytesScanned,
      wallclockMs: descriptor.meta.ceilings.wallclockMs,
    }
  }

  const bytesRemaining = remaining.bytes
  const wallclockRemaining = remaining.wallclockMs

  // Check bytes ceiling
  if (bytesRemaining !== undefined && bytesRemaining <= 0) {
    const retryKey = RETRY_KEY.ceiling(descriptor.name)
    const retryCount = turnState.retryCount.get(retryKey) ?? 0
    const disposition = retryCount >= 1 ? 'abort' : 'retry'
    return tripwire('ceiling_breach_bytes', disposition, {
      toolName: descriptor.name,
      bytesRemaining,
      wallclockRemaining: wallclockRemaining ?? null,
    })
  }

  // Check wallclock ceiling
  if (wallclockRemaining !== undefined && wallclockRemaining <= 0) {
    const retryKey = RETRY_KEY.ceiling(descriptor.name)
    const retryCount = turnState.retryCount.get(retryKey) ?? 0
    const disposition = retryCount >= 1 ? 'abort' : 'retry'
    return tripwire('ceiling_breach_wallclock', disposition, {
      toolName: descriptor.name,
      bytesRemaining: bytesRemaining ?? null,
      wallclockRemaining,
    })
  }

  return { kind: 'ok', remaining }
}

// ─── Step 4 — preWriteAbortCheck ─────────────────────────────────────────────

/**
 * Guards mutations against a cancelled AbortSignal before any domain side-effects
 * are triggered. Read-only tools (`query` procedures) pass unconditionally.
 *
 * This step is a no-op for queries regardless of signal state.
 */
export function preWriteAbortCheck(input: {
  descriptor: AgentToolDescriptor
  abortSignal: AbortSignal
}): { kind: 'ok' } | Tripwire {
  const { descriptor, abortSignal } = input

  if (descriptor.procedure === 'query') {
    return { kind: 'ok' }
  }

  if (abortSignal.aborted) {
    return tripwire('abort_pre_write', 'abort', {
      toolName: descriptor.name,
      reason: abortSignal.reason,
    })
  }

  return { kind: 'ok' }
}

// ─── Step 5 — invoke ──────────────────────────────────────────────────────────

/**
 * Interface for the tRPC caller adapter used by `invoke`.
 * A concrete implementation wrapping `getAppRouter().createCaller(ctx)` ships in Task 5.
 * This is a synchronous-signature-but-async-return interface because tRPC createCaller
 * is shaped that way.
 */
export interface TrpcCaller {
  call(input: {
    toolName: string
    args: unknown
    requestContext: RequestContext
    mode: 'execute' | 'dry-run'
  }): Promise<unknown>
}

/**
 * Invokes the tRPC procedure via `caller.call(...)` and maps errors to tripwires.
 *
 * Error taxonomy (§7):
 *  - FORBIDDEN                    → `permission_denied`,       fixed abort
 *  - BAD_REQUEST w/ Zod cause     → `validation_failed`,       retry (orchestrator may downgrade)
 *  - CONFLICT / UNPROCESSABLE     → `business_rule_violation`, fixed abort
 *  - TIMEOUT / CLIENT_CLOSED      → `invocation_timeout`,      retry
 *  - INTERNAL_SERVER_ERROR / other tRPC infra → `infra_error`, fixed abort
 *  - Unknown non-TRPCError throw  → `infra_error`,             fixed abort
 *
 * NOTE on `transient_infra_error`:
 *   This variant IS produced here when the thrown error looks transient (e.g.
 *   SERVICE_UNAVAILABLE, TOO_MANY_REQUESTS, ECONNRESET, ETIMEDOUT). The orchestrator
 *   (Task 5) detects `transient_infra_error` with `disposition: 'retry'` and executes
 *   a single in-gateway retry (with jitter). Only after that retry is exhausted does
 *   the orchestrator return the tripwire to the caller.
 *
 *   Rationale for classifying here rather than adding `rawError` to tripwire context:
 *   - `rawError` (a live Error object) on a Tripwire could carry large stacks, circular
 *     references, or PII; a sanitizer bug would leak it.
 *   - The original error is available HERE; classify it once, keep it out of the payload.
 *   - The orchestrator only needs the variant + disposition to know it should retry once.
 *
 * NOTE on sanitization (R-01.29):
 *   `rawMessage` in the context carries the raw error message. The orchestrator
 *   applies `projectToSchema` / sanitization before handing the context to the
 *   sub-agent, so no sanitization happens here.
 */
export async function invoke(input: {
  descriptor: AgentToolDescriptor
  args: unknown
  requestContext: RequestContext
  mode: 'execute' | 'dry-run'
  caller: TrpcCaller
}): Promise<{ kind: 'ok'; result: unknown } | Tripwire> {
  const { descriptor, args, requestContext, mode, caller } = input

  try {
    const result = await caller.call({
      toolName: descriptor.name,
      args,
      requestContext,
      mode,
    })
    return { kind: 'ok', result }
  } catch (err: unknown) {
    if (err instanceof TRPCError) {
      return mapTrpcError(descriptor.name, err)
    }

    // Unknown non-TRPCError — check for transient network patterns first
    const rawMessage = err instanceof Error ? err.message : String(err)
    if (TRANSIENT_MESSAGE_RE.test(rawMessage)) {
      return tripwire('transient_infra_error', 'retry', {
        toolName: descriptor.name,
        rawMessage,
      })
    }

    return tripwire('infra_error', 'abort', {
      toolName: descriptor.name,
      rawMessage,
    })
  }
}

/**
 * Pattern matching transient network errors in non-TRPCError messages.
 * Kept broad enough to catch common Node.js socket resets and DNS failures.
 */
const TRANSIENT_MESSAGE_RE = /ECONNRESET|ETIMEDOUT|network/i

/**
 * Duck-type check for a Zod-like error with an `issues` array.
 * We rely on structural match rather than an `instanceof ZodError` check so
 * this helper stays decoupled from the exact Zod version imported by the caller.
 */
function isZodLikeIssuesError(
  cause: unknown,
): cause is { issues: Array<{ path: readonly (string | number)[]; message: string }> } {
  if (cause === null || cause === undefined || typeof cause !== 'object') return false
  if (!('issues' in cause)) return false
  const issues = (cause as { issues: unknown }).issues
  return Array.isArray(issues)
}

/**
 * Maps a TRPCError to the appropriate tripwire variant.
 * Internal helper — not exported.
 */
function mapTrpcError(toolName: string, err: TRPCError): Tripwire {
  const rawMessage = err.message
  const trpcCode = err.code

  // Extract Zod field name from cause if available
  let fieldName: string | undefined
  if (isZodLikeIssuesError(err.cause)) {
    const issues = err.cause.issues
    if (issues.length > 0 && issues[0]) {
      const path = issues[0].path
      if (Array.isArray(path) && path.length > 0) {
        fieldName = String(path[0])
      }
    }
  }

  const baseContext = { toolName, rawMessage, trpcCode }

  switch (trpcCode) {
    case 'FORBIDDEN':
      return tripwire('permission_denied', 'abort', baseContext)

    case 'BAD_REQUEST': {
      // Validation error: BAD_REQUEST with message containing 'validation' OR Zod cause
      const isValidation =
        rawMessage.toLowerCase().includes('validation') || isZodLikeIssuesError(err.cause)
      if (isValidation) {
        return tripwire(
          'validation_failed',
          'retry',
          fieldName !== undefined ? { ...baseContext, fieldName } : baseContext,
        )
      }
      // BAD_REQUEST without validation markers → infra_error (fall through)
      return tripwire('infra_error', 'abort', baseContext)
    }

    case 'CONFLICT':
    case 'UNPROCESSABLE_CONTENT':
      return tripwire('business_rule_violation', 'abort', baseContext)

    case 'TIMEOUT':
    case 'CLIENT_CLOSED_REQUEST':
      return tripwire('invocation_timeout', 'retry', baseContext)

    case 'SERVICE_UNAVAILABLE':
    case 'TOO_MANY_REQUESTS':
      return tripwire('transient_infra_error', 'retry', baseContext)

    default:
      // INTERNAL_SERVER_ERROR and any other tRPC infra codes → infra_error
      return tripwire('infra_error', 'abort', baseContext)
  }
}

// ─── Step 6a — applyTaintWrap ─────────────────────────────────────────────────

/**
 * Wraps tenant-authored free-text fields in the result with XML-like delimiter
 * markers so the downstream LLM prompt layer can identify and handle them.
 *
 * Wrapping template: `<tenant_authored field="NAME">VALUE</tenant_authored>`
 *
 * Rules:
 *  - Only wraps string values (non-string values are left untouched).
 *  - Only wraps top-level fields of a plain object result (or each item's
 *    top-level fields when result is an array).
 *  - Does NOT traverse deeper than one level.
 *  - Does NOT HTML-escape — the downstream LLM prompt layer handles that.
 *  - Flips `turnState.tainted.value = true` if any field was actually wrapped.
 */
export function applyTaintWrap(input: {
  result: unknown
  fieldsToWrap: ReadonlyArray<string>
  turnState: TurnState
}): { wrappedResult: unknown; fieldsWrapped: ReadonlyArray<string>; taintFlipped: boolean } {
  const { result, fieldsToWrap, turnState } = input

  if (fieldsToWrap.length === 0) {
    return { wrappedResult: result, fieldsWrapped: [], taintFlipped: false }
  }

  // Null/undefined/primitive — nothing to wrap
  if (result === null || result === undefined || typeof result !== 'object') {
    return { wrappedResult: result, fieldsWrapped: [], taintFlipped: false }
  }

  const wrappedFields = new Set<string>()

  if (Array.isArray(result)) {
    const wrappedArray = result.map((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return item
      }
      const { wrapped, fields } = wrapObjectFields(item as Record<string, unknown>, fieldsToWrap)
      for (const f of fields) wrappedFields.add(f)
      return wrapped
    })

    const taintFlipped = wrappedFields.size > 0
    if (taintFlipped) turnState.tainted.value = true

    return {
      wrappedResult: wrappedArray,
      fieldsWrapped: Array.from(wrappedFields),
      taintFlipped,
    }
  }

  // Plain object
  const { wrapped, fields } = wrapObjectFields(result as Record<string, unknown>, fieldsToWrap)
  for (const f of fields) wrappedFields.add(f)

  const taintFlipped = wrappedFields.size > 0
  if (taintFlipped) turnState.tainted.value = true

  return {
    wrappedResult: wrapped,
    fieldsWrapped: Array.from(wrappedFields),
    taintFlipped,
  }
}

/**
 * Shallow-wraps string fields in a single plain object.
 * Returns the mutated copy and the set of fields actually wrapped.
 */
function wrapObjectFields(
  obj: Record<string, unknown>,
  fieldsToWrap: ReadonlyArray<string>,
): { wrapped: Record<string, unknown>; fields: string[] } {
  const wrapped = { ...obj }
  const fields: string[] = []

  for (const fieldName of fieldsToWrap) {
    if (fieldName in wrapped && typeof wrapped[fieldName] === 'string') {
      wrapped[fieldName] =
        `<tenant_authored field="${fieldName}">${wrapped[fieldName]}</tenant_authored>`
      fields.push(fieldName)
    }
  }

  return { wrapped, fields }
}

// ─── Step 6b — auditEmit ──────────────────────────────────────────────────────

/**
 * Emits an `agent.tool_called` audit event via `KernelAuditFacade.recordEvent`.
 *
 * CRITICAL: This function MUST NOT throw. An audit write failure must never
 * mask a successful tool invocation (§7 — audit-failure is an async compensation
 * concern; it does NOT tripwire the user-visible path). Always returns
 * `{ emitted: false, error }` on failure.
 *
 * P1 visibility: when `emitted` is false the step itself logs `toolName` and
 * `traceId` at error level so the failure is observable without requiring the
 * orchestrator to inspect the return value.
 */
export async function auditEmit(input: {
  descriptor: AgentToolDescriptor
  requestContext: RequestContext
  resultStatus:
    | 'success'
    | 'permission_denied'
    | 'permission_denied_disabled'
    | 'validation_error'
    | 'business_rule_violation'
    | 'infra_error'
    | 'transient_error'
    | 'timeout'
    | 'ceiling_hit'
    | 'aborted'
  resultHash?: string
  extraAttrs?: Readonly<Record<string, unknown>>
  auditFacade: KernelAuditFacade
  logger: Pick<Logger, 'error'>
}): Promise<{ emitted: boolean; error?: unknown }> {
  const { descriptor, requestContext, resultStatus, resultHash, extraAttrs, auditFacade, logger } =
    input

  try {
    await auditFacade.recordEvent({
      tenantId: requestContext.tenantId,
      actorId: requestContext.userId,
      eventType: 'agent.tool_called',
      module: 'agents',
      subjectId: descriptor.name,
      payload: {
        permission: descriptor.permission,
        resultStatus,
        resultHash,
        extraAttrs,
        traceId: requestContext.traceId,
      },
    })
    return { emitted: true }
  } catch (error: unknown) {
    logger.error(
      `agent.tool_called audit emit failed for tool="${descriptor.name}" traceId="${requestContext.traceId}"`,
      error instanceof Error ? error.stack : String(error),
    )
    return { emitted: false, error }
  }
}
