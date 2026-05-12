import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from '../errors'
import { withRetry } from './retry'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the value on first success', async () => {
    const fn = vi.fn(async () => 42)
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal })
    await expect(p).resolves.toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on transient error up to maxRetries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('ok')
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('rethrows on terminal error without retrying', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 })
    const ctrl = new AbortController()
    await expect(withRetry(fn, { maxRetries: 2, signal: ctrl.signal })).rejects.toMatchObject({
      status: 401,
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('rethrows the last error after exhausting retries', async () => {
    const err = { status: 503 }
    const fn = vi.fn().mockRejectedValue(err)
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal })
    p.catch(() => {})
    await vi.runAllTimersAsync()
    await expect(p).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('aborts immediately when signal already aborted', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 })
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(withRetry(fn, { maxRetries: 5, signal: ctrl.signal })).rejects.toMatchObject({
      status: 503,
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('aborts mid-backoff when signal fires during sleep', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 })
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 5, signal: ctrl.signal })
    p.catch(() => {})
    await Promise.resolve()
    ctrl.abort()
    await vi.runAllTimersAsync()
    await expect(p).rejects.toMatchObject({ status: 503 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('invokes onAttempt for each failure with attempt index', async () => {
    const onAttempt = vi.fn()
    const fn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce('ok')
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal, onAttempt })
    await vi.runAllTimersAsync()
    await p
    expect(onAttempt).toHaveBeenCalledWith(1, { status: 503 })
  })

  it('retries an LlmError instance that carries a transient status', async () => {
    const err = new LlmError({ code: 'X', category: 'THIRD_PARTY', message: 'm' })
    ;(err as unknown as { status: number }).status = 503
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok')
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 1, signal: ctrl.signal })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
  })
})
