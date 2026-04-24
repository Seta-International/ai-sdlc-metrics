/**
 * abort-coordinator.spec.ts — Plan 06 Task 3
 *
 * Covers:
 *  1. composeTurnAbortSignal: basic compose returns signal + two controllers
 *  2. User cancel: abort userCancelController → signal.aborted, captureReason()='user'
 *  3. Timeout: AbortSignal.timeout(0) fires → captureReason()='timeout' after a tick
 *  4. System abort with 'budget' reason
 *  5. System abort with 'provider_outage' reason
 *  6. System abort with 'quality_canary' reason
 *  7. First-fired wins: user abort wins over later system abort
 *  8. None aborted → captureReason()=undefined
 *  9. AbortPayloadBuilder.buildPayload: user cancel maps to 'cancelled', includes usage and cancelled_by
 * 10. buildPayload: timeout maps to 'timeout', usage propagated
 * 11. buildPayload: budget maps to 'budget'
 * 12. buildPayload: cancelled_by undefined when not provided
 */

import { describe, it, expect } from 'vitest'
import {
  composeTurnAbortSignal,
  AbortPayloadBuilder,
  ZERO_USAGE,
  type UsageSnapshot,
} from './abort-coordinator'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('composeTurnAbortSignal', () => {
  it('1. returns a signal, userCancelController, and systemAbortController', () => {
    const result = composeTurnAbortSignal({ wallclockMs: 60_000 })

    expect(result.signal).toBeInstanceOf(AbortSignal)
    expect(result.userCancelController).toBeInstanceOf(AbortController)
    expect(result.systemAbortController).toBeInstanceOf(AbortController)
    expect(typeof result.captureReason).toBe('function')
  })

  it('2. user cancel aborts the composed signal and captureReason returns "user"', () => {
    const { signal, userCancelController, captureReason } = composeTurnAbortSignal({
      wallclockMs: 60_000,
    })

    expect(signal.aborted).toBe(false)

    userCancelController.abort()

    expect(signal.aborted).toBe(true)
    expect(captureReason()).toBe('user')
  })

  it('3. timeout fires → captureReason returns "timeout" after a tick', async () => {
    const { captureReason } = composeTurnAbortSignal({ wallclockMs: 0 })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(captureReason()).toBe('timeout')
  })

  it('4. system abort with "budget" reason → captureReason returns "budget"', () => {
    const { systemAbortController, captureReason } = composeTurnAbortSignal({
      wallclockMs: 60_000,
    })

    systemAbortController.abort('budget')

    expect(captureReason()).toBe('budget')
  })

  it('5. system abort with "provider_outage" reason → captureReason returns "provider_outage"', () => {
    const { systemAbortController, captureReason } = composeTurnAbortSignal({
      wallclockMs: 60_000,
    })

    systemAbortController.abort('provider_outage')

    expect(captureReason()).toBe('provider_outage')
  })

  it('6. system abort with "quality_canary" reason → captureReason returns "quality_canary"', () => {
    const { systemAbortController, captureReason } = composeTurnAbortSignal({
      wallclockMs: 60_000,
    })

    systemAbortController.abort('quality_canary')

    expect(captureReason()).toBe('quality_canary')
  })

  it('7. first-fired wins: user abort prevents system reason from overwriting', () => {
    const { userCancelController, systemAbortController, captureReason } = composeTurnAbortSignal({
      wallclockMs: 60_000,
    })

    userCancelController.abort()
    systemAbortController.abort('budget')

    expect(captureReason()).toBe('user')
  })

  it('8. none aborted → captureReason returns undefined', () => {
    const { captureReason } = composeTurnAbortSignal({ wallclockMs: 60_000 })

    expect(captureReason()).toBeUndefined()
  })
})

describe('AbortPayloadBuilder.buildPayload', () => {
  const usage: UsageSnapshot = {
    input_tokens: 100,
    output_tokens: 50,
    input_cached_read: 10,
    input_cached_write: 5,
    output_reasoning: 20,
  }

  it('9. user cancel maps to "cancelled", includes usage and cancelled_by', () => {
    const payload = AbortPayloadBuilder.buildPayload({
      reason: 'user',
      usageAccumulator: usage,
      cancelledBy: 'user-id-42',
    })

    expect(payload).toEqual({
      reason: 'cancelled',
      usage,
      cancelled_by: 'user-id-42',
    })
  })

  it('10. timeout maps to "timeout", usage propagated', () => {
    const payload = AbortPayloadBuilder.buildPayload({
      reason: 'timeout',
      usageAccumulator: usage,
    })

    expect(payload).toEqual({
      reason: 'timeout',
      usage,
    })
  })

  it('11. budget maps to "budget"', () => {
    const payload = AbortPayloadBuilder.buildPayload({
      reason: 'budget',
      usageAccumulator: ZERO_USAGE,
    })

    expect(payload.reason).toBe('budget')
    expect(payload.usage).toEqual(ZERO_USAGE)
  })

  it('13. buildPayload for provider_outage maps reason correctly', () => {
    const payload = AbortPayloadBuilder.buildPayload({
      reason: 'provider_outage',
      usageAccumulator: ZERO_USAGE,
    })

    expect(payload.reason).toBe('provider_outage')
    expect(payload.usage).toEqual(ZERO_USAGE)
  })

  it('14. buildPayload for quality_canary maps reason correctly', () => {
    const payload = AbortPayloadBuilder.buildPayload({
      reason: 'quality_canary',
      usageAccumulator: ZERO_USAGE,
    })

    expect(payload.reason).toBe('quality_canary')
    expect(payload.usage).toEqual(ZERO_USAGE)
  })

  it('12. cancelled_by is absent when not provided', () => {
    const payload = AbortPayloadBuilder.buildPayload({
      reason: 'user',
      usageAccumulator: ZERO_USAGE,
    })

    expect(payload).not.toHaveProperty('cancelled_by')
  })
})
