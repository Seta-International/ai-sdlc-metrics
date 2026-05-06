import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withProviderRetry, type RetryOpts } from './provider-retry'

function makeRateLimitError(retryAfterSec?: number): Error & Record<string, unknown> {
  const err = new Error('rate limit exceeded') as Error & Record<string, unknown>
  err['status'] = 429
  if (retryAfterSec !== undefined) {
    err['headers'] = { 'retry-after': String(retryAfterSec) }
  }
  return err
}

function makeAuthError(): Error & Record<string, unknown> {
  const err = new Error('unauthorized') as Error & Record<string, unknown>
  err['status'] = 401
  return err
}

function makeServerError(): Error & Record<string, unknown> {
  const err = new Error('internal server error') as Error & Record<string, unknown>
  err['status'] = 500
  return err
}

describe('withProviderRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns result immediately when first attempt succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withProviderRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries once on 429 and succeeds on second attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeRateLimitError())
      .mockResolvedValue('ok-after-retry')
    const promise = withProviderRetry(fn, { baseDelayMs: 10, jitterMs: 0 })
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result).toBe('ok-after-retry')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('honours retryAfterMs from Retry-After header', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeRateLimitError(3)) // 3 seconds
      .mockResolvedValue('done')
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const promise = withProviderRetry(fn)
    await vi.runAllTimersAsync()
    await promise
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1] as number)
    expect(delays.some((d) => d >= 3000 && d <= 32_000)).toBe(true)
  })

  it('does NOT issue a third attempt when maxAttempts=2 and both fail', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeRateLimitError())
      .mockRejectedValueOnce(makeRateLimitError())
    const opts: RetryOpts = { maxAttempts: 2, baseDelayMs: 10, jitterMs: 0 }
    const promise = withProviderRetry(fn, opts)
    await vi.runAllTimersAsync()
    await expect(promise).rejects.toThrow('rate limit exceeded')
    expect(fn).toHaveBeenCalledTimes(2) // 1 original + 1 retry = 2 total; no third
  })

  it('does NOT retry on 401 (non-retryable)', async () => {
    const fn = vi.fn().mockRejectedValue(makeAuthError())
    await expect(withProviderRetry(fn)).rejects.toThrow('unauthorized')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 server error', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeServerError()).mockResolvedValue('recovered')
    const promise = withProviderRetry(fn, { baseDelayMs: 10, jitterMs: 0 })
    await vi.runAllTimersAsync()
    expect(await promise).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
