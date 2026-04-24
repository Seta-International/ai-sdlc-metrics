// Tripwires are returned values, never thrown. Do NOT create a TripwireError extends Error class.
// Per R-01.2: each pipeline step may tripwire by returning a discriminated-union result;
// throwing a TripwireError is a runtime bug that must escalate to `turn.ended.reason: error`.

import type { DraftProposalResult } from '../../application/services/draft-types'

// ─── Variants ────────────────────────────────────────────────────────────────

export type TripwireVariant =
  | 'procedure_not_agent_exposed'
  | 'procedure_out_of_sub_agent_scope'
  | 'permission_denied'
  | 'permission_denied_disabled'
  | 'ceiling_breach_bytes'
  | 'ceiling_breach_wallclock'
  | 'abort_pre_write'
  | 'validation_failed'
  | 'business_rule_violation'
  | 'infra_error'
  | 'transient_infra_error'
  | 'invocation_timeout'

export type TripwireDisposition = 'abort' | 'retry'

// ─── Fixed-disposition variants ──────────────────────────────────────────────

/**
 * These variants always carry disposition `abort`, per §4.
 * Misuse is caught at construction time by `enforceFixedDisposition`.
 */
const FIXED_ABORT_VARIANTS: ReadonlySet<TripwireVariant> = new Set([
  'permission_denied',
  'permission_denied_disabled',
  'abort_pre_write',
  'procedure_not_agent_exposed',
  'procedure_out_of_sub_agent_scope',
  'business_rule_violation',
  'infra_error',
])

/**
 * Validates that fixed-disposition variants are not constructed with the wrong disposition.
 * Throws at construction time so misuse is loud rather than silently wrong.
 *
 * @throws {Error} if a fixed-abort variant is passed disposition `'retry'`
 */
export function enforceFixedDisposition(
  variant: TripwireVariant,
  disposition: TripwireDisposition,
): TripwireDisposition {
  if (FIXED_ABORT_VARIANTS.has(variant) && disposition !== 'abort') {
    throw new Error(
      `TripwireVariant '${variant}' has a fixed disposition of 'abort'; received '${disposition}'.`,
    )
  }
  return disposition
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface Tripwire {
  readonly kind: 'tripwire'
  readonly variant: TripwireVariant
  readonly disposition: TripwireDisposition
  readonly context: Readonly<Record<string, unknown>>
}

export interface ToolGatewayOk {
  readonly kind: 'ok'
  readonly result: unknown
  readonly fromCache: boolean
  /**
   * Present when a mutation tool was successfully invoked and DraftProposer produced
   * a draft proposal. Absent on query tools and cache-hit paths.
   * Plan 08 §5: the sub-agent runner collects these to build SubAgentOutput.drafts.
   */
  readonly draft?: DraftProposalResult
}

export type ToolGatewayResult = ToolGatewayOk | Tripwire

// ─── Construction helpers ─────────────────────────────────────────────────────

// `result` is opaque (unknown) — deep-freezing would be brittle and expensive;
// the security-sensitive surface is `context` (on Tripwire), not `result`.
export function ok(
  result: unknown,
  fromCache: boolean,
  draft?: DraftProposalResult,
): ToolGatewayOk {
  const base = { kind: 'ok' as const, result, fromCache }
  return Object.freeze(draft !== undefined ? { ...base, draft } : base)
}

export function tripwire(
  variant: TripwireVariant,
  disposition: TripwireDisposition,
  context: Record<string, unknown>,
): Tripwire {
  const validatedDisposition = enforceFixedDisposition(variant, disposition)
  return Object.freeze({
    kind: 'tripwire',
    variant,
    disposition: validatedDisposition,
    context: Object.freeze({ ...context }),
  })
}

// ─── Type predicates ──────────────────────────────────────────────────────────

export function isOk(r: ToolGatewayResult): r is ToolGatewayOk {
  return r.kind === 'ok'
}

export function isTripwire(r: ToolGatewayResult): r is Tripwire {
  return r.kind === 'tripwire'
}
