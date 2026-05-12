import { describe, expect, it, vi } from 'vitest'
import { createContinuationStore } from './_continuation'
import {
  ContinuationBadHmac,
  ContinuationConsumed,
  ContinuationExpired,
  ContinuationUserMismatch,
} from './_errors'

const HMAC_KEY = 'a'.repeat(64)

const fakeSql = (state: { row?: Record<string, unknown> } = {}) => {
  const sql = vi.fn().mockImplementation(async () => (state.row ? [state.row] : []))
  ;(sql as any).begin = (fn: any) => fn(sql)
  return sql as unknown as any
}

describe('continuation token mint/verify', () => {
  it('mint returns a parseable token and inserts a row', async () => {
    const sql = fakeSql({})
    const store = createContinuationStore({
      sql,
      hmacKey: HMAC_KEY,
      ttlMin: 15,
      now: () => Date.parse('2026-05-12T00:00:00Z'),
    })
    const { token } = await store.mint({
      tenantId: 't',
      userId: 'u',
      toolId: 'planner.update_tasks',
      payload: { foo: 'bar' },
      etagSnapshot: { T1: 'W/"1"' },
    })
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('verify rejects bad HMAC', async () => {
    const sql = fakeSql({
      row: {
        uuid: 'u',
        payload: {},
        etagSnapshot: {},
        expiresAt: new Date(Date.now() + 1e6),
        consumedAt: null,
        userId: 'u',
        toolId: 'planner.update_tasks',
        tenantId: 't',
      },
    })
    const store = createContinuationStore({ sql, hmacKey: HMAC_KEY, ttlMin: 15 })
    await expect(
      store.verify({
        token: 'uuid.tampered',
        userId: 'u',
        tenantId: 't',
        toolId: 'planner.update_tasks',
      }),
    ).rejects.toBeInstanceOf(ContinuationBadHmac)
  })

  it('verify rejects expired token', async () => {
    const pastDate = new Date(Date.now() - 1000)
    const sql = fakeSql({
      row: {
        uuid: 'some-uuid',
        payload: {},
        etagSnapshot: {},
        expiresAt: pastDate,
        consumedAt: null,
        userId: 'u',
        toolId: 'planner.update_tasks',
        tenantId: 't',
      },
    })
    const store = createContinuationStore({ sql, hmacKey: HMAC_KEY, ttlMin: 15 })
    // We need a valid sig for this uuid - but since we can't easily compute it, test that expired check fires after hmac passes
    // Actually for this test, the HMAC will fail first since we pass a bad token. Let's test with a real round-trip:
    const mintSql = fakeSql({})
    const store2 = createContinuationStore({
      sql: mintSql,
      hmacKey: HMAC_KEY,
      ttlMin: 15,
      now: () => Date.now() - 2_000_000,
    })
    const { token } = await store2.mint({
      tenantId: 't',
      userId: 'u',
      toolId: 'planner.update_tasks',
      payload: {},
      etagSnapshot: {},
    })
    // Now verify with a sql that returns the row but with past expiresAt
    const [uuid] = token.split('.')
    const expiredSql = fakeSql({
      row: {
        uuid,
        payload: {},
        etagSnapshot: {},
        expiresAt: pastDate,
        consumedAt: null,
        userId: 'u',
        toolId: 'planner.update_tasks',
        tenantId: 't',
      },
    })
    const store3 = createContinuationStore({ sql: expiredSql, hmacKey: HMAC_KEY, ttlMin: 15 })
    await expect(
      store3.verify({ token, userId: 'u', tenantId: 't', toolId: 'planner.update_tasks' }),
    ).rejects.toBeInstanceOf(ContinuationExpired)
  })

  it('verify rejects consumed (and surfaces cached resultCard)', async () => {
    const mintSql = fakeSql({})
    const store = createContinuationStore({ sql: mintSql, hmacKey: HMAC_KEY, ttlMin: 15 })
    const { token } = await store.mint({
      tenantId: 't',
      userId: 'u',
      toolId: 'planner.update_tasks',
      payload: {},
      etagSnapshot: {},
    })
    const [uuid] = token.split('.')
    const cached = { type: 'AdaptiveCard', body: [] }
    const consumedSql = fakeSql({
      row: {
        uuid,
        payload: {},
        etagSnapshot: {},
        expiresAt: new Date(Date.now() + 1e6),
        consumedAt: new Date(),
        userId: 'u',
        toolId: 'planner.update_tasks',
        tenantId: 't',
        resultCard: cached,
      },
    })
    const store2 = createContinuationStore({ sql: consumedSql, hmacKey: HMAC_KEY, ttlMin: 15 })
    const err = await store2
      .verify({ token, userId: 'u', tenantId: 't', toolId: 'planner.update_tasks' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ContinuationConsumed)
    expect((err as ContinuationConsumed).cachedResultCard).toEqual(cached)
  })

  it('verify rejects user mismatch', async () => {
    const mintSql = fakeSql({})
    const store = createContinuationStore({ sql: mintSql, hmacKey: HMAC_KEY, ttlMin: 15 })
    const { token } = await store.mint({
      tenantId: 't',
      userId: 'u',
      toolId: 'planner.update_tasks',
      payload: {},
      etagSnapshot: {},
    })
    const [uuid] = token.split('.')
    const mismatchSql = fakeSql({
      row: {
        uuid,
        payload: {},
        etagSnapshot: {},
        expiresAt: new Date(Date.now() + 1e6),
        consumedAt: null,
        userId: 'other-user',
        toolId: 'planner.update_tasks',
        tenantId: 't',
      },
    })
    const store2 = createContinuationStore({ sql: mismatchSql, hmacKey: HMAC_KEY, ttlMin: 15 })
    await expect(
      store2.verify({ token, userId: 'u', tenantId: 't', toolId: 'planner.update_tasks' }),
    ).rejects.toBeInstanceOf(ContinuationUserMismatch)
  })

  it('markConsumed updates the row', async () => {
    const sql = fakeSql({})
    const store = createContinuationStore({ sql, hmacKey: HMAC_KEY, ttlMin: 15 })
    await store.markConsumed('tok', { type: 'AdaptiveCard' })
    expect(sql).toHaveBeenCalled()
  })
})
