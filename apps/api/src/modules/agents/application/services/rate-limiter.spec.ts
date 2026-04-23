/**
 * rate-limiter.spec.ts — Plan 05 R-05.23–26 — RateLimiter service
 *
 * Covers:
 *  1. First call to queries/user/min → allowed, remaining=29
 *  2. 30th call → allowed, remaining=0
 *  3. 31st call → not allowed, remaining=0
 *  4. l3_writes/user/day different key → separate bucket (limit=20)
 *  5. DB failure (throws) → fails soft, returns allowed=true
 */

import { describe, it, expect, vi } from 'vitest'
import { RateLimiter } from './rate-limiter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const USER_ID = '01900000-0000-7000-8000-000000000002'

// ─── Mock factories ───────────────────────────────────────────────────────────

/**
 * Builds a DB mock that simulates a successful upsert + read-back with `count`.
 */
function buildRateLimiterDb(count: number) {
  // insert chain: insert().values().onConflictDoUpdate() → void
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined)
  const insertValuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock })
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock })

  // select chain: select().from().where() → [{ count }]
  const whereMock = vi.fn().mockResolvedValue([{ count }])
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return {
    db: { insert: insertMock, select: selectMock } as never,
    insertMock,
    insertValuesMock,
    onConflictDoUpdateMock,
  }
}

/**
 * Builds a DB mock where the upsert throws to simulate a transient DB failure.
 */
function buildFailingDb() {
  const insertMock = vi.fn().mockImplementation(() => {
    throw new Error('DB connection lost')
  })
  return { db: { insert: insertMock } as never }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  it('1. first call to queries/user/min → allowed=true, remaining=29', async () => {
    const { db } = buildRateLimiterDb(1) // DB returns count=1 after upsert
    const limiter = new RateLimiter(db)

    const result = await limiter.check({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limitKey: 'queries/user/min',
    })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(29) // 30 - 1
    expect(result.resetAt).toBeInstanceOf(Date)
  })

  it('2. 30th call to queries/user/min → allowed=true, remaining=0', async () => {
    const { db } = buildRateLimiterDb(30) // DB returns count=30
    const limiter = new RateLimiter(db)

    const result = await limiter.check({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limitKey: 'queries/user/min',
    })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0) // 30 - 30
  })

  it('3. 31st call to queries/user/min → allowed=false, remaining=0', async () => {
    const { db } = buildRateLimiterDb(31) // DB returns count=31 (over limit)
    const limiter = new RateLimiter(db)

    const result = await limiter.check({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limitKey: 'queries/user/min',
    })

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.resetAt).toBeInstanceOf(Date)
  })

  it('4. l3_writes/user/day uses limit=20 (different key, separate bucket)', async () => {
    // count=1 → remaining=19 (limit 20)
    const { db } = buildRateLimiterDb(1)
    const limiter = new RateLimiter(db)

    const result = await limiter.check({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limitKey: 'l3_writes/user/day',
    })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(19) // 20 - 1
  })

  it('5. DB failure → fails soft, returns allowed=true (R-05.26)', async () => {
    const { db } = buildFailingDb()
    const limiter = new RateLimiter(db)

    const result = await limiter.check({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limitKey: 'queries/user/min',
    })

    expect(result).toEqual({ allowed: true })
  })

  it('6. schedule_creations/user/day uses limit=5 (R-05.25)', async () => {
    // count=1 → remaining=4 (limit 5)
    const { db } = buildRateLimiterDb(1)
    const limiter = new RateLimiter(db)

    const result = await limiter.check({
      tenantId: TENANT_ID,
      userId: USER_ID,
      limitKey: 'schedule_creations/user/day',
    })

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4) // 5 - 1
  })
})
