import { WorkflowBailed, WorkflowSuspended } from '../errors'
import type { RetryPolicy } from '../types/step'
import { classifyError } from './classify'

const BASE_DELAY_MS = 250
const MAX_DELAY_MS = 4000

function nextDelayMs(attempt: number, opts?: RetryPolicy['backoff']): number {
  const base = opts?.baseDelayMs ?? BASE_DELAY_MS
  const max = opts?.maxDelayMs ?? MAX_DELAY_MS
  const raw = base * 2 ** attempt
  const capped = Math.min(raw, max)
  const useJitter = opts?.jitter ?? true
  const jitter = useJitter ? 0.8 + Math.random() * 0.4 : 1
  return Math.round(capped * jitter)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy | undefined,
  signal: AbortSignal,
): Promise<T> {
  if (!policy) return fn()

  const predicate = policy.shouldRetry ?? ((err: unknown) => classifyError(err) === 'transient')

  let lastErr: unknown
  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (err instanceof WorkflowBailed) throw err
      if (err instanceof WorkflowSuspended) throw err
      if (signal.aborted) throw err
      if (!predicate(err)) throw err
      if (attempt === policy.maxAttempts - 1) throw err
      try {
        await sleep(nextDelayMs(attempt, policy.backoff), signal)
      } catch {
        throw lastErr
      }
    }
  }
  throw lastErr
}
