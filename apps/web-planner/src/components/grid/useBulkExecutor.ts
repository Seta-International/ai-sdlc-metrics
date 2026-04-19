import { useState, useCallback } from 'react'

type RunResult = { ok: true } | { ok: false; error: Error }

type BulkExecutorState<T> = {
  status: 'idle' | 'running' | 'done' | 'error'
  successCount: number
  failedInputs: T[]
  currentIndex: number
  total: number
}

export function useBulkExecutor<T>({ run }: { run: (item: T) => Promise<RunResult> }) {
  const [state, setState] = useState<BulkExecutorState<T>>({
    status: 'idle',
    successCount: 0,
    failedInputs: [],
    currentIndex: 0,
    total: 0,
  })

  const execute = useCallback(
    async (items: T[]) => {
      setState({
        status: 'running',
        successCount: 0,
        failedInputs: [],
        currentIndex: 0,
        total: items.length,
      })

      let successCount = 0
      for (let i = 0; i < items.length; i++) {
        const result = await run(items[i])
        if (!result.ok) {
          // Stop on first error — remaining items also go to failedInputs
          setState((prev) => ({
            ...prev,
            status: 'error',
            successCount,
            failedInputs: items.slice(i),
            currentIndex: i,
          }))
          return
        }
        successCount++
        setState((prev) => ({ ...prev, successCount, currentIndex: i + 1 }))
      }
      setState((prev) => ({ ...prev, status: 'done', successCount, failedInputs: [] }))
    },
    [run],
  )

  const start = useCallback((items: T[]) => execute(items), [execute])
  const retryFailed = useCallback(() => {
    const toRetry = state.failedInputs
    return execute(toRetry)
  }, [execute, state.failedInputs])

  return { ...state, start, retryFailed }
}
