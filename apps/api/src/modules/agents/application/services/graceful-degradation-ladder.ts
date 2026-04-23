import { Injectable } from '@nestjs/common'
import type {
  LadderStepState,
  LadderTrigger,
  TenantLadderState,
  VendorErrorClass,
} from '../../domain/cost/cost-types'

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

@Injectable()
export class GracefulDegradationLadder {
  // Exposed for test override
  _stepMessages: Record<number, string> = { ...DEFAULT_STEP_MESSAGES }

  private readonly consecutiveOverloadCount = new Map<string, number>()
  private fallbackActive = false
  private fallbackModelId: string | null = null

  evaluate(opts: {
    trigger: LadderTrigger
    modelId: string
    iteration: number
    currentTier: 'full' | 'nano'
    tenantState: TenantLadderState
  }): LadderStepState {
    const { trigger, modelId, iteration, tenantState } = opts

    // Step 7 — budget refuse (highest priority check, trigger-based)
    if (trigger === 'budget_exhausted') {
      return this._buildStep(7, trigger, 'refused', { cancellationReason: 'budget' })
    }

    // Step 6 — canary collapse refuse
    if (trigger === 'canary_collapse') {
      return this._buildStep(6, trigger, 'refused', { cancellationReason: 'quality_canary' })
    }

    // Step 5 — both tiers degraded
    if (trigger === 'canary_degraded_both') {
      return this._buildStep(5, trigger, 'tier_shift')
    }

    // Step 4 — primary tier degraded
    if (trigger === 'canary_degraded_primary') {
      return this._buildStep(4, trigger, 'tier_shift')
    }

    // Step 3 — nano outage
    if (trigger === 'nano_5xx') {
      return this._buildStep(3, trigger, 'provider_outage')
    }

    // Step 2 — provider_fallback (3+ consecutive overloads)
    if (trigger === 'provider_5xx' && this.shouldFallback(modelId)) {
      if (!this.fallbackActive) {
        this.fallbackActive = true
        this.fallbackModelId = `${modelId}-nano`
      }
      return this._buildStep(2, trigger, 'provider_fallback')
    }

    // Step 1 — provider_retry (first attempt, transient)
    return this._buildStep(1, trigger, 'provider_retry')
  }

  recordSuccess(modelId: string): void {
    this.consecutiveOverloadCount.set(modelId, 0)
  }

  recordError(modelId: string, errorClass: VendorErrorClass): void {
    const isOverload =
      errorClass === 'vendor_overload' ||
      errorClass === 'vendor_server_error' ||
      errorClass === 'vendor_rate_limit'
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
