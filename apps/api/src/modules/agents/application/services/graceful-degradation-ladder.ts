import type {
  LadderStepState,
  LadderTrigger,
  TenantLadderState,
  VendorErrorClass,
} from '../../domain/cost/cost-types'
import {
  recordLadderStep,
  recordLadderTransitionLatency,
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
  /** Tracks the last error class that incremented the consecutive-overload counter per model. */
  private readonly lastOverloadErrorClass = new Map<string, VendorErrorClass>()
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

    const stepStart = Date.now()

    // Step 7 — budget refuse (highest priority check, trigger-based)
    if (trigger === 'budget_exhausted') {
      const step = this._buildStep(7, trigger, 'refused', { cancellationReason: 'budget' })
      // Emit ladder step + tier shift metrics (Plan 05 §8)
      recordLadderStep(tenantId, 7, 'refused')
      recordTierShift(tenantId, opts.currentTier, 'refused', 'budget')
      recordLadderTransitionLatency(7, Date.now() - stepStart)
      return step
    }

    // Step 6 — canary collapse refuse
    if (trigger === 'canary_collapse') {
      const step = this._buildStep(6, trigger, 'refused', { cancellationReason: 'quality_canary' })
      recordLadderStep(tenantId, 6, 'refused')
      recordTierShift(tenantId, opts.currentTier, 'refused', 'quality_canary')
      recordLadderTransitionLatency(6, Date.now() - stepStart)
      return step
    }

    // Step 5 — both tiers degraded
    if (trigger === 'canary_degraded_both') {
      const step = this._buildStep(5, trigger, 'tier_shift')
      recordLadderStep(tenantId, 5, 'tier_shift')
      recordTierShift(tenantId, 'full', 'nano', 'quality_canary')
      recordLadderTransitionLatency(5, Date.now() - stepStart)
      return step
    }

    // Step 4 — primary tier degraded
    if (trigger === 'canary_degraded_primary') {
      const step = this._buildStep(4, trigger, 'tier_shift')
      recordLadderStep(tenantId, 4, 'tier_shift')
      recordTierShift(tenantId, 'full', 'nano', 'quality_canary')
      recordLadderTransitionLatency(4, Date.now() - stepStart)
      return step
    }

    // Step 3 — nano outage
    if (trigger === 'nano_5xx') {
      const step = this._buildStep(3, trigger, 'provider_outage')
      recordLadderStep(tenantId, 3, 'provider_outage')
      recordLadderTransitionLatency(3, Date.now() - stepStart)
      return step
    }

    // Step 2 — provider_fallback (3+ consecutive overloads / server errors)
    if (trigger === 'provider_5xx' && this.shouldFallback(modelId)) {
      if (!this.fallbackActive) {
        this.fallbackActive = true
        this.fallbackModelId = `${modelId}-nano`
      }
      const step = this._buildStep(2, trigger, 'provider_fallback')
      recordLadderStep(tenantId, 2, 'provider_fallback')
      // Use the actual error class that triggered the fallback (R-05.20a).
      // lastOverloadErrorClass tracks whichever class (vendor_overload or vendor_server_error)
      // last incremented the consecutive counter — it is the correct discriminator for the
      // provider_fallback_total metric. Defaulting to 'vendor_overload' here would corrupt
      // the error-class dashboard for vendor_server_error-driven fallbacks.
      const errorClass = this.lastOverloadErrorClass.get(modelId) ?? 'vendor_overload'
      recordProviderFallback(tenantId, modelId, errorClass)
      recordLadderTransitionLatency(2, Date.now() - stepStart)
      return step
    }

    // Step 1 — provider_retry (first attempt, transient)
    const step = this._buildStep(1, trigger, 'provider_retry')
    recordLadderStep(tenantId, 1, 'provider_retry')
    recordLadderTransitionLatency(1, Date.now() - stepStart)
    return step
  }

  recordSuccess(modelId: string): void {
    this.consecutiveOverloadCount.set(modelId, 0)
    this.lastOverloadErrorClass.delete(modelId)
  }

  recordError(modelId: string, errorClass: VendorErrorClass): void {
    // vendor_rate_limit → wait+retry once; spec forbids fallback for rate-limit errors (R-05.20c)
    const isOverload = errorClass === 'vendor_overload' || errorClass === 'vendor_server_error'
    if (isOverload) {
      const current = this.consecutiveOverloadCount.get(modelId) ?? 0
      this.consecutiveOverloadCount.set(modelId, current + 1)
      // Track the last error class so evaluate() can emit the correct error_class
      // on the provider_fallback metric (R-05.20a). Mixed sequences (overload then
      // server_error) record the class of the most recent counted failure.
      this.lastOverloadErrorClass.set(modelId, errorClass)
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
