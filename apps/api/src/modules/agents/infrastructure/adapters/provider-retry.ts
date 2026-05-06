import { OpenAiVendorErrorExtractor } from './openai-vendor-error-extractor'
import type { VendorError } from '../../domain/cost/cost-types'

export interface RetryOpts {
  /** Base delay in ms before first retry. Default: 500. */
  baseDelayMs?: number
  /** Exponential multiplier. Default: 2. */
  multiplier?: number
  /** Random jitter upper bound in ms. Default: 200. */
  jitterMs?: number
  /**
   * Total number of attempts including the original call. Default: 2.
   * SAD NFR §3.2 cap: do not raise above 2 without explicit approval.
   */
  maxAttempts?: number
}

const MAX_DELAY_MS = 32_000
const extractor = new OpenAiVendorErrorExtractor()

function isRetryable(e: VendorError): boolean {
  return (
    e.class === 'vendor_rate_limit' ||
    e.class === 'vendor_server_error' ||
    e.class === 'vendor_overload' ||
    e.class === 'vendor_timeout'
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wraps an async provider call with SAD-capped exponential backoff retry.
 *
 * - maxAttempts defaults to 2 (1 original + 1 retry). Do not raise without approval.
 * - SDK callers must pass maxRetries: 0 so the SDK never retries independently.
 * - Non-retryable errors (401 auth, etc.) are re-thrown immediately on first failure.
 * - Retry-After headers are honoured, capped at 32 s.
 */
export async function withProviderRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { baseDelayMs = 500, multiplier = 2, jitterMs = 200, maxAttempts = 2 } = opts

  if (maxAttempts < 1) throw new Error('maxAttempts must be at least 1')

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= maxAttempts - 1) throw err

      const vendorError = extractor.extract(err)
      if (!vendorError || !isRetryable(vendorError)) throw err

      let delayMs: number
      if (vendorError.retryAfterMs !== undefined) {
        delayMs = Math.min(vendorError.retryAfterMs, MAX_DELAY_MS)
      } else {
        const exp = baseDelayMs * Math.pow(multiplier, attempt)
        delayMs = Math.min(exp + Math.floor(Math.random() * jitterMs), MAX_DELAY_MS)
      }

      await sleep(delayMs)
    }
  }
  // Unreachable: the loop always returns or throws, but TypeScript cannot
  // prove it. This satisfies the return-type exhaustiveness check.
  throw new Error('withProviderRetry: exhausted all attempts')
}
