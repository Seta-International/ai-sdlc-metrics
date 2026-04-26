import type {
  LadderStepState,
  LadderTrigger,
  TenantLadderState,
  VendorErrorClass,
} from '../../domain/cost/cost-types'
import {
  recordLadderStep,
  recordTierShift,
  recordProviderFallback,
} from '../../infrastructure/observability/cost-metrics'

export class LadderInvariantError extends Error {
  constructor(step: number) {
    super(`R-05.40 violation: step ${step} produced an empty userMessage`)
    this.name = 'LadderInvariantError'
  }
}

// Exposed as a property so tests can monkey-patch it for the invariant test
const DEFAULT_STEP_MESSAGES: Record<number, string> = {
  1: '',
  2: 'Switched to faster model for this response.',
  3: 'Partial — model unavailable.',
  4: 'Answering in simplified mode — full-quality mode resumes shortly.',
  5: 'Service quality is degraded across all tiers.',
  6: 'Service temporarily unavailable; try again shortly.',
  7: 'Daily budget reached; try again tomorrow.',
}

const FALLBACK_THRESHOLD = 3

// Per-turn instantiation: use `new GracefulDegradationLadder()` at the start of each turn.
// NOT a NestJS singleton — state is turn-scoped (fallbackActive, consecutiveOverloadCount).
export class GracefulDegradationLadder {
  // Exposed for test override
  _stepMessages: Record<number, string> = { ...DEFAULT_STEP_MESSAGES }

  private readonly consecutiveOverloadCount = new Map<string, number>()
  private fallbackActive = false
  private fallbackModelId: string | null = null

  evaluate(opts: {
    tenantId: string
    trigger: LadderTrigger
    modelId: string
    iteration: number
    currentTier: 'full' | 'nano'
    tenantState: TenantLadderState
  }): LadderStepState {
    const { tenantId, trigger, modelId, iteration: _iteration, tenantState: _tenantState } = opts

    // Step 7 — budget refuse (highest priority check, trigger-based)
    if (trigger === 'budget_exhausted') {
      const step = this._buildStep(7, trigger, 'refused', { cancellationReason: 'budget' })
      // Emit ladder step + tier shift metrics (Plan 05 §8)
      recordLadderStep(tenantId, 7, 'refused')
      recordTierShift(tenantId, opts.currentTier, 'refused', 'budget')
      return step
    }

    // Step 6 — canary collapse refuse
    if (trigger === 'canary_collapse') {
      const step = this._buildStep(6, trigger, 'refused', { cancellationReason: 'quality_canary' })
      recordLadderStep(tenantId, 6, 'refused')
      recordTierShift(tenantId, opts.currentTier, 'refused', 'quality_canary')
      return step
    }

    // Step 5 — both tiers degraded
    if (trigger === 'canary_degraded_both') {
      const step = this._buildStep(5, trigger, 'tier_shift')
      recordLadderStep(tenantId, 5, 'tier_shift')
      recordTierShift(tenantId, 'full', 'nano', 'quality_canary')
      return step
    }

    // Step 4 — primary tier degraded
    if (trigger === 'canary_degraded_primary') {
      const step = this._buildStep(4, trigger, 'tier_shift')
      recordLadderStep(tenantId, 4, 'tier_shift')
      recordTierShift(tenantId, 'full', 'nano', 'quality_canary')
      return step
    }

    // Step 3 — nano outage
    if (trigger === 'nano_5xx') {
      const step = this._buildStep(3, trigger, 'provider_outage')
      recordLadderStep(tenantId, 3, 'provider_outage')
      return step
    }

    // Step 2 — provider_fallback (3+ consecutive overloads)
    if (trigger === 'provider_5xx' && this.shouldFallback(modelId)) {
      if (!this.fallbackActive) {
        this.fallbackActive = true
        this.fallbackModelId = `${modelId}-nano`
      }
      const step = this._buildStep(2, trigger, 'provider_fallback')
      recordLadderStep(tenantId, 2, 'provider_fallback')
      // provider_fallback metric: the error class driving this fallback is unknown at this
      // level (the caller drives recordError separately). Emit as vendor_overload since
      // step 2 is only reached via shouldFallback which counts vendor_overload / vendor_server_error.
      recordProviderFallback(tenantId, modelId, 'vendor_overload')
      return step
    }

    // Step 1 — provider_retry (first attempt, transient)
    const step = this._buildStep(1, trigger, 'provider_retry')
    recordLadderStep(tenantId, 1, 'provider_retry')
    return step
  }

  recordSuccess(modelId: string): void {
    this.consecutiveOverloadCount.set(modelId, 0)
  }

  recordError(modelId: string, errorClass: VendorErrorClass): void {
    // vendor_rate_limit → wait+retry once; spec forbids fallback for rate-limit errors (R-05.20c)
    const isOverload = errorClass === 'vendor_overload' || errorClass === 'vendor_server_error'
    if (isOverload) {
      const current = this.consecutiveOverloadCount.get(modelId) ?? 0
      this.consecutiveOverloadCount.set(modelId, current + 1)
    }
  }

  shouldFallback(modelId: string): boolean {
    return (this.consecutiveOverloadCount.get(modelId) ?? 0) >= FALLBACK_THRESHOLD
  }

  private _buildStep(
    step: 1 | 2 | 3 | 4 | 5 | 6 | 7,
    trigger: LadderTrigger,
    traceTag: LadderStepState['traceTag'],
    extra?: { cancellationReason?: 'quality_canary' | 'budget' },
  ): LadderStepState {
    const userMessage = this._stepMessages[step] ?? ''

    // R-05.40: every step except step 1 must have a non-empty userMessage
    if (step !== 1 && userMessage === '') {
      throw new LadderInvariantError(step)
    }

    const result: LadderStepState = { step, trigger, userMessage, traceTag }
    if (extra?.cancellationReason) result.cancellationReason = extra.cancellationReason
    return result
  }
}
