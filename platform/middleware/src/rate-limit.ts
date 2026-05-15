import type { Context, MiddlewareHandler } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'

export type RateLimitOpts = {
  /**
   * Steady requests-per-second allowance. Informational only — the underlying
   * fixed-window limiter enforces `burst` as the per-`windowMs` cap. At the
   * default `windowMs` of 1 000 ms, `burst` is effectively the per-second
   * limit. `rps` is retained in the signature for call-site documentation and
   * future token-bucket upgrade.
   */
  rps: number
  /** Maximum requests allowed in the window (per-key). Acts as both the steady
   *  and burst cap for the current fixed-window implementation. */
  burst: number
  /** Returns a stable key per requester (IP, user id, tenant id, …). */
  key: (c: Context) => string
}

/**
 * Thin wrapper around `hono-rate-limiter`'s `rateLimiter`.
 *
 * Uses a 1-second fixed window with `burst` as the per-window request cap.
 * Responds with HTTP 429 and standard `RateLimit-*` headers (draft-7) when
 * the cap is exceeded. The `rps` option is preserved for documentation but
 * not separately enforced — upgrade to a token-bucket store when you need
 * precise sub-second shaping.
 */
export function rateLimit(opts: RateLimitOpts): MiddlewareHandler {
  return rateLimiter({
    windowMs: 1_000,
    limit: opts.burst,
    standardHeaders: 'draft-7',
    keyGenerator: (c) => opts.key(c),
  })
}
