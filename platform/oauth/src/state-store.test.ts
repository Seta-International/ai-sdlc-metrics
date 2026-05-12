import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { createStateStore } from './state-store'

const URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

describe('oauth_state store', () => {
  const sql = postgres(URL, { max: 1, prepare: false })
  const store = createStateStore(sql)

  afterAll(async () => {
    await sql.end()
  })

  it('mint + consume round-trip', async () => {
    const state = await store.mint({
      providerId: 'entra',
      connectorIds: ['ms365-planner', 'ms365-directory'],
      ttlSec: 60,
    })
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/)

    const row = await store.consume(state)
    expect(row?.connectorIds).toEqual(['ms365-planner', 'ms365-directory'])
    expect(row?.providerId).toBe('entra')

    // second consume returns null (deleted)
    expect(await store.consume(state)).toBeNull()
  })

  it('consume returns null for expired state', async () => {
    const state = await store.mint({
      providerId: 'entra',
      connectorIds: [],
      ttlSec: -1, // already expired
    })
    expect(await store.consume(state)).toBeNull()
  })
})
