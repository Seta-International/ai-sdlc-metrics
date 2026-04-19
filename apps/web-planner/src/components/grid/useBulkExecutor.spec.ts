import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBulkExecutor } from './useBulkExecutor'

describe('useBulkExecutor', () => {
  it('runs tasks sequentially and reports progress', async () => {
    const runs: number[] = []
    const { result } = renderHook(() =>
      useBulkExecutor({
        run: async (i: number) => {
          runs.push(i)
          return { ok: true as const }
        },
      }),
    )
    await act(async () => {
      await result.current.start([1, 2, 3])
    })
    expect(runs).toEqual([1, 2, 3])
    expect(result.current.status).toBe('done')
    expect(result.current.successCount).toBe(3)
  })

  it('stops on first error and exposes failed items for retry', async () => {
    const { result } = renderHook(() =>
      useBulkExecutor({
        run: async (i: number) =>
          i === 2 ? { ok: false as const, error: new Error('boom') } : { ok: true as const },
      }),
    )
    await act(async () => {
      await result.current.start([1, 2, 3])
    })
    expect(result.current.status).toBe('error')
    expect(result.current.successCount).toBe(1)
    expect(result.current.failedInputs).toEqual([2, 3])
  })

  it('retryFailed re-runs only the failed items', async () => {
    let failOnTwo = true
    const { result } = renderHook(() =>
      useBulkExecutor({
        run: async (i: number) => {
          if (i === 2 && failOnTwo) return { ok: false as const, error: new Error('boom') }
          return { ok: true as const }
        },
      }),
    )
    await act(async () => {
      await result.current.start([1, 2, 3])
    })
    expect(result.current.status).toBe('error')
    failOnTwo = false
    await act(async () => {
      await result.current.retryFailed()
    })
    expect(result.current.status).toBe('done')
    expect(result.current.failedInputs).toEqual([])
  })
})
