import { describe, expect, it, vi } from 'vitest'
import { createContinuationStore } from './_continuation'
import { ContinuationConsumed, ContinuationExpired } from './_errors'

const HMAC_KEY = 'a'.repeat(64)

const fakeSql = (state: { row?: Record<string, unknown> } = {}) => {
  const sql = vi.fn().mockImplementation(async () => (state.row ? [state.row] : []))
  return sql as unknown as never
}

describe('createContinuationStore', () => {
  it('mint inserts a row and returns a token with a dot', async () => {
    const sql = fakeSql()
    const store = createContinuationStore({ sql, hmacKey: HMAC_KEY, ttlMin: 10 })
    const { token } = await store.mint({
      tenantId: 't1',
      userId: 'u1',
      toolId: 'planner.update_tasks',
      payload: { updates: [] },
      etagSnapshot: {},
    })
    expect(token).toContain('.')
    expect(sql).toHaveBeenCalledOnce()
  })

  it('verify throws ContinuationExpired when expiresAt is in the past', async () => {
    const mintSql = fakeSql()
    const store = createContinuationStore({
      sql: mintSql,
      hmacKey: HMAC_KEY,
      ttlMin: 10,
      now: () => Date.now() - 2_000_000,
    })
    const { token } = await store.mint({
      tenantId: 't1',
      userId: 'u1',
      toolId: 'planner.update_tasks',
      payload: {},
      etagSnapshot: {},
    })
    const [uuid] = token.split('.')
    const expiredSql = fakeSql({
      row: {
        uuid,
        payload: {},
        etagSnapshot: {},
        resultCard: null,
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
        userId: 'u1',
        toolId: 'planner.update_tasks',
        tenantId: 't1',
      },
    })
    const store2 = createContinuationStore({ sql: expiredSql, hmacKey: HMAC_KEY, ttlMin: 10 })
    await expect(
      store2.verify({ token, userId: 'u1', tenantId: 't1', toolId: 'planner.update_tasks' }),
    ).rejects.toBeInstanceOf(ContinuationExpired)
  })

  it('verify throws ContinuationConsumed when consumedAt is set', async () => {
    const mintSql = fakeSql()
    const store = createContinuationStore({ sql: mintSql, hmacKey: HMAC_KEY, ttlMin: 10 })
    const { token } = await store.mint({
      tenantId: 't1',
      userId: 'u1',
      toolId: 'planner.update_tasks',
      payload: {},
      etagSnapshot: {},
    })
    const [uuid] = token.split('.')
    const consumedSql = fakeSql({
      row: {
        uuid,
        payload: {},
        etagSnapshot: {},
        resultCard: { ok: true },
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
        userId: 'u1',
        toolId: 'planner.update_tasks',
        tenantId: 't1',
      },
    })
    const store2 = createContinuationStore({ sql: consumedSql, hmacKey: HMAC_KEY, ttlMin: 10 })
    await expect(
      store2.verify({ token, userId: 'u1', tenantId: 't1', toolId: 'planner.update_tasks' }),
    ).rejects.toBeInstanceOf(ContinuationConsumed)
  })
})
