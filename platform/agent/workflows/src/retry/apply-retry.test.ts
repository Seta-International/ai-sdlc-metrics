import { describe, expect, it, vi } from 'vitest'
import { WorkflowBailed, WorkflowSuspended } from '../errors'
import { executeWithRetry } from './apply-retry'

class TransientError extends Error {
  status = 503
}

class FatalError extends Error {
  status = 400
}

describe('executeWithRetry', () => {
  it('no retry config → runs fn exactly once, fails on first error', async () => {
    const fn = vi.fn().mockRejectedValue(new TransientError('boom'))
    await expect(executeWithRetry(fn, undefined, new AbortController().signal)).rejects.toThrow(
      'boom',
    )
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries transient (default predicate) up to maxAttempts', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TransientError('1'))
      .mockRejectedValueOnce(new TransientError('2'))
      .mockResolvedValueOnce('ok')
    const result = await executeWithRetry(fn, { maxAttempts: 3 }, new AbortController().signal)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry non-transient errors with default predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new FatalError('400 bad'))
    await expect(
      executeWithRetry(fn, { maxAttempts: 3 }, new AbortController().signal),
    ).rejects.toThrow('400 bad')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('honors custom shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockResolvedValueOnce('ok')
    const result = await executeWithRetry(
      fn,
      { maxAttempts: 2, shouldRetry: () => true },
      new AbortController().signal,
    )
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('never retries WorkflowBailed', async () => {
    const fn = vi.fn().mockRejectedValue(new WorkflowBailed('done'))
    await expect(
      executeWithRetry(
        fn,
        { maxAttempts: 5, shouldRetry: () => true },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(WorkflowBailed)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('never retries WorkflowSuspended', async () => {
    const fn = vi.fn().mockRejectedValue(new WorkflowSuspended('approve'))
    await expect(
      executeWithRetry(
        fn,
        { maxAttempts: 5, shouldRetry: () => true },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(WorkflowSuspended)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
