import { randomBytes } from 'node:crypto'
import type { Sql } from 'postgres'

export type StateRow = {
  state: string
  providerId: string
  connectorIds: string[]
  nonce: string
  expiresAt: Date
}

export interface StateStore {
  mint(input: { providerId: string; connectorIds: string[]; ttlSec?: number }): Promise<string>
  consume(state: string): Promise<StateRow | null>
}

export function createStateStore(sql: Sql): StateStore {
  return {
    async mint({ providerId, connectorIds, ttlSec = 900 }) {
      const state = randomBytes(24).toString('base64url')
      const nonce = randomBytes(16).toString('base64url')
      const expiresAt = new Date(Date.now() + ttlSec * 1000)
      await sql`
        INSERT INTO oauth.oauth_state (state, provider_id, connector_ids, nonce, expires_at)
        VALUES (${state}, ${providerId}, ${connectorIds}, ${nonce}, ${expiresAt})
      `
      return state
    },

    async consume(state) {
      const rows = await sql<
        Array<{
          state: string
          provider_id: string
          connector_ids: string[]
          nonce: string
          expires_at: Date
        }>
      >`
        DELETE FROM oauth.oauth_state
         WHERE state = ${state} AND expires_at > now()
         RETURNING state, provider_id, connector_ids, nonce, expires_at
      `
      const r = rows[0]
      if (!r) return null
      return {
        state: r.state,
        providerId: r.provider_id,
        connectorIds: r.connector_ids,
        nonce: r.nonce,
        expiresAt: new Date(r.expires_at),
      }
    },
  }
}
