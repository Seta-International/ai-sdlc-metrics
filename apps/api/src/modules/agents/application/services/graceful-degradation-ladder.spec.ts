import { GracefulDegradationLadder, LadderInvariantError } from './graceful-degradation-ladder'
import type { TenantLadderState } from '../../domain/cost/cost-types'

const nominalState: TenantLadderState = { severity: 'nominal' }

function makeLadder() {
  return new GracefulDegradationLadder()
}

describe('GracefulDegradationLadder', () => {
  describe('Step 1 — provider_retry', () => {
    it('fires on provider_5xx trigger when no fallback active', () => {
      const ladder = makeLadder()
      const result = ladder.evaluate({
        trigger: 'provider_5xx',
        modelId: 'gpt-5.4',
        iteration: 1,
        currentTier: 'full',
        tenantState: nominalState,
      })
      expect(result.step).toBe(1)
      expect(result.trigger).toBe('provider_5xx')
      expect(result.traceTag).toBe('provider_retry')
      expect(result.userMessage).toBe('')
    })
  })

  describe('Step 2 — provider_fallback', () => {
    it('fires when shouldFallback returns true (3 consecutive overloads)', () => {
      const ladder = makeLadder()
      const modelId = 'gpt-5.4'

      // Record 3 consecutive overload errors
      ladder.recordError(modelId, 'vendor_overload')
      ladder.recordError(modelId, 'vendor_overload')
      ladder.recordError(modelId, 'vendor_overload')

      expect(ladder.shouldFallback(modelId)).toBe(true)

      const result = ladder.evaluate({
        trigger: 'provider_5xx',
        modelId,
        iteration: 2,
        currentTier: 'full',
        tenantState: nominalState,
      })
      expect(result.step).toBe(2)
      expect(result.traceTag).toBe('provider_fallback')
      expect(result.userMessage).toBe('Switched to faster model for this response.')
    })
  })

  describe('Step 3 — provider_outage', () => {
    it('fires on nano_5xx trigger', () => {
      const ladder = makeLadder()
      const result = ladder.evaluate({
        trigger: 'nano_5xx',
        modelId: 'gpt-5.4-nano',
        iteration: 1,
        currentTier: 'nano',
        tenantState: nominalState,
      })
      expect(result.step).toBe(3)
      expect(result.traceTag).toBe('provider_outage')
      expect(result.userMessage).toBe('Partial — model unavailable.')
    })
  })

  describe('Step 4 — tier_shift (canary primary degraded)', () => {
    it('fires on canary_degraded_primary tenant state', () => {
      const ladder = makeLadder()
      const result = ladder.evaluate({
        trigger: 'canary_degraded_primary',
        modelId: 'gpt-5.4',
        iteration: 1,
        currentTier: 'full',
        tenantState: { severity: 'primary_degraded', canaryWindowId: 'win-1' },
      })
      expect(result.step).toBe(4)
      expect(result.traceTag).toBe('tier_shift')
      expect(result.userMessage).toBe(
        'Answering in simplified mode — full-quality mode resumes shortly.',
      )
    })
  })

  describe('Step 5 — tier_shift (both degraded)', () => {
    it('fires on canary_degraded_both tenant state with elevated notice', () => {
      const ladder = makeLadder()
      const result = ladder.evaluate({
        trigger: 'canary_degraded_both',
        modelId: 'gpt-5.4',
        iteration: 1,
        currentTier: 'full',
        tenantState: { severity: 'both_degraded', canaryWindowId: 'win-2' },
      })
      expect(result.step).toBe(5)
      expect(result.traceTag).toBe('tier_shift')
      expect(result.userMessage).toBe('Service quality is degraded across all tiers.')
    })
  })

  describe('Step 6 — hard refuse on canary collapse', () => {
    it('fires on canary_collapse trigger with quality_canary cancellation', () => {
      const ladder = makeLadder()
      const result = ladder.evaluate({
        trigger: 'canary_collapse',
        modelId: 'gpt-5.4',
        iteration: 1,
        currentTier: 'full',
        tenantState: { severity: 'collapse', canaryWindowId: 'win-3' },
      })
      expect(result.step).toBe(6)
      expect(result.traceTag).toBe('refused')
      expect(result.userMessage).toBe('Service temporarily unavailable; try again shortly.')
      expect(result.cancellationReason).toBe('quality_canary')
    })
  })

  describe('Step 7 — budget refuse', () => {
    it('fires on budget_exhausted trigger with budget cancellation', () => {
      const ladder = makeLadder()
      const result = ladder.evaluate({
        trigger: 'budget_exhausted',
        modelId: 'gpt-5.4',
        iteration: 1,
        currentTier: 'full',
        tenantState: nominalState,
      })
      expect(result.step).toBe(7)
      expect(result.traceTag).toBe('refused')
      expect(result.userMessage).toBe('Daily budget reached; try again tomorrow.')
      expect(result.cancellationReason).toBe('budget')
    })
  })

  describe('R-05.40 invariant — empty userMessage throws', () => {
    it('throws LadderInvariantError if a non-step-1 step would have empty userMessage', () => {
      // We test this via a subclass or by directly checking that the invariant
      // is enforced. We monkey-patch the STEP_MESSAGES to simulate violation.
      const ladder = makeLadder() as any
      // Temporarily override to produce empty message for step 2
      const originalMessages = ladder._stepMessages
      ladder._stepMessages = { ...originalMessages, 2: '' }

      // Force shouldFallback by recording 3 errors
      ladder.recordError('model-x', 'vendor_overload')
      ladder.recordError('model-x', 'vendor_overload')
      ladder.recordError('model-x', 'vendor_overload')

      expect(() =>
        ladder.evaluate({
          trigger: 'provider_5xx',
          modelId: 'model-x',
          iteration: 2,
          currentTier: 'full',
          tenantState: nominalState,
        }),
      ).toThrow(LadderInvariantError)

      // Restore
      ladder._stepMessages = originalMessages
    })
  })

  describe('shouldFallback threshold', () => {
    it('returns false before 3 consecutive errors', () => {
      const ladder = makeLadder()
      ladder.recordError('model-a', 'vendor_overload')
      ladder.recordError('model-a', 'vendor_overload')
      expect(ladder.shouldFallback('model-a')).toBe(false)
    })

    it('returns true at exactly 3 consecutive errors', () => {
      const ladder = makeLadder()
      ladder.recordError('model-a', 'vendor_overload')
      ladder.recordError('model-a', 'vendor_overload')
      ladder.recordError('model-a', 'vendor_overload')
      expect(ladder.shouldFallback('model-a')).toBe(true)
    })
  })

  describe('recordSuccess resets counter', () => {
    it('2 errors → success → 1 more error → shouldFallback=false', () => {
      const ladder = makeLadder()
      ladder.recordError('model-b', 'vendor_overload')
      ladder.recordError('model-b', 'vendor_overload')
      ladder.recordSuccess('model-b')
      ladder.recordError('model-b', 'vendor_overload')
      expect(ladder.shouldFallback('model-b')).toBe(false)
    })
  })

  describe('provider_fallback and tier_shift never conflated', () => {
    it('two consecutive calls return distinct trace tags when both conditions apply', () => {
      const ladder = makeLadder()
      const modelId = 'gpt-5.4'

      // Trigger provider_fallback on first call
      ladder.recordError(modelId, 'vendor_overload')
      ladder.recordError(modelId, 'vendor_overload')
      ladder.recordError(modelId, 'vendor_overload')

      const call1 = ladder.evaluate({
        trigger: 'provider_5xx',
        modelId,
        iteration: 2,
        currentTier: 'full',
        tenantState: { severity: 'primary_degraded', canaryWindowId: 'win-x' },
      })

      // Second call with tier_shift condition
      const call2 = ladder.evaluate({
        trigger: 'canary_degraded_primary',
        modelId,
        iteration: 3,
        currentTier: 'full',
        tenantState: { severity: 'primary_degraded', canaryWindowId: 'win-x' },
      })

      expect(call1.traceTag).toBe('provider_fallback')
      expect(call2.traceTag).toBe('tier_shift')
      expect(call1.traceTag).not.toBe(call2.traceTag)
    })
  })
})
