import { useState, useCallback, useRef } from 'react'

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

  const failedInputsRef = useRef<T[]>([])
  const isRunningRef = useRef(false)

  const execute = useCallback(
    async (items: T[]): Promise<{ status: 'done' | 'error' }> => {
      if (isRunningRef.current) return { status: 'error' }
      isRunningRef.current = true

      setState({
        status: 'running',
        successCount: 0,
        failedInputs: [],
        currentIndex: 0,
        total: items.length,
      })

      let successCount = 0
      let i = 0
      for (const item of items) {
        const result = await run(item)
        if (!result.ok) {
          // Stop on first error — remaining items also go to failedInputs
          const failed = items.slice(i)
          failedInputsRef.current = failed
          setState((prev) => ({
            ...prev,
            status: 'error',
            successCount,
            failedInputs: failed,
            currentIndex: i,
          }))
          isRunningRef.current = false
          return { status: 'error' }
        }
        successCount++
        i++
        setState((prev) => ({ ...prev, successCount, currentIndex: i }))
      }
      failedInputsRef.current = []
      setState((prev) => ({ ...prev, status: 'done', successCount, failedInputs: [] }))
      isRunningRef.current = false
      return { status: 'done' }
    },
    [run],
  )

  const start = useCallback(
    (items: T[]): Promise<{ status: 'done' | 'error' }> => execute(items),
    [execute],
  )
  const retryFailed = useCallback((): Promise<{ status: 'done' | 'error' }> => {
    return execute(failedInputsRef.current)
  }, [execute])

  return { ...state, start, retryFailed }
}
