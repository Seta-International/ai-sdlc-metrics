/**
 * SamplingConfig discriminated union, TriggerPredicate types, and the 5 MVP
 * trigger predicates.
 *
 * Domain layer — zero NestJS/Drizzle imports.
 */

// ─── Context ──────────────────────────────────────────────────────────────────

export type TriggerPredicateContext = {
  turnEndedReason?: string // e.g. 'completed' | 'refused' | 'budget' | 'error' | 'user_cancel' | 'timeout' | 'quality_canary'
  taintFlipped: boolean
  approvalRequiredDraftSubmitted: boolean
  compositionAmplification: boolean
  iterationCeilingHit: boolean
  wallclockCeilingHit: boolean
  costCeilingHit: boolean
  // Beta signals (always false at MVP — kept for forward-compat typing)
  iterationCountExceededP95?: boolean
  routerRechoseAfterReplan?: boolean
  topologyDowngradeCandidate?: boolean
}

// ─── TriggerPredicate ─────────────────────────────────────────────────────────

export type TriggerPredicate = (ctx: TriggerPredicateContext) => boolean

// ─── SamplingConfig ───────────────────────────────────────────────────────────

export type SamplingConfig =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'ratio'; probability: number } // 0.0–1.0
  | { type: 'triggered'; triggers: TriggerPredicate[]; baselineProbability: number }
  | { type: 'composite'; configs: SamplingConfig[]; strategy: 'any' | 'all' }

// ─── MVP Trigger Predicates ───────────────────────────────────────────────────

/** R-07.12: turn ended reason is not 'completed' */
export const turnNotCompletedTrigger: TriggerPredicate = function turnNotCompletedTrigger(
  ctx,
): boolean {
  return ctx.turnEndedReason !== undefined && ctx.turnEndedReason !== 'completed'
}

/** R-07.13: any ceiling hit */
export const ceilingHitTrigger: TriggerPredicate = function ceilingHitTrigger(ctx): boolean {
  return ctx.iterationCeilingHit || ctx.wallclockCeilingHit || ctx.costCeilingHit
}

/** R-07.14: taint flipped */
export const taintFlippedTrigger: TriggerPredicate = function taintFlippedTrigger(ctx): boolean {
  return ctx.taintFlipped
}

/** R-07.15: approval-required draft submitted */
export const approvalRequiredTrigger: TriggerPredicate = function approvalRequiredTrigger(
  ctx,
): boolean {
  return ctx.approvalRequiredDraftSubmitted
}

/** R-07.16: composition amplification */
export const compositionAmplificationTrigger: TriggerPredicate =
  function compositionAmplificationTrigger(ctx): boolean {
    return ctx.compositionAmplification
  }

// ─── Default Configs ──────────────────────────────────────────────────────────

/**
 * MVP production config: stratified — 1% baseline + 100% on any of the 5 triggers.
 * R-07.17: Baseline sampling rate = 1% for completed turns.
 */
export const STRATIFIED_MVP_CONFIG: SamplingConfig = {
  type: 'triggered',
  baselineProbability: 0.01,
  triggers: [
    turnNotCompletedTrigger,
    ceilingHitTrigger,
    taintFlippedTrigger,
    approvalRequiredTrigger,
    compositionAmplificationTrigger,
  ],
}

/** Dev/test config: always capture everything */
export const ALWAYS_CAPTURE_CONFIG: SamplingConfig = { type: 'always' }
