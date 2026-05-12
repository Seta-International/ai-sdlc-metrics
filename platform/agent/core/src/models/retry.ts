import { classifyError } from '../errors/classify'

export interface RetryOpts {
  maxRetries: number
  signal: AbortSignal
  onAttempt?: (attempt: number, err: unknown) => void
}

const BASE_DELAY_MS = 250
const MAX_DELAY_MS = 4000

function nextDelayMs(attempt: number): number {
  const raw = BASE_DELAY_MS * 2 ** attempt
  const capped = Math.min(raw, MAX_DELAY_MS)
  const jitter = 0.8 + Math.random() * 0.4
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

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      opts.onAttempt?.(attempt + 1, err)
      if (opts.signal.aborted) throw err
      if (classifyError(err) === 'terminal') throw err
      if (attempt === opts.maxRetries) throw err
      try {
        await sleep(nextDelayMs(attempt), opts.signal)
      } catch {
        throw lastErr
      }
    }
  }
  throw lastErr
}
