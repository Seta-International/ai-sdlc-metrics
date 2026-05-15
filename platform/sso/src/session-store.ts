import type { Sql } from 'postgres'
import type { SessionStore } from './middleware'
import type { Session } from './schema'

export function createSessionStore(sql: Sql): SessionStore & {
  insert(input: {
    id: string
    userId: string
    expiresAt: Date
    ip: string | null
    userAgent: string | null
  }): Promise<void>
  delete(sessionId: string): Promise<void>
} {
  return {
    async get(sessionId) {
      const rows = await sql<
        Array<{
          id: string
          user_id: string
          expires_at: Date
          ip: string | null
          user_agent: string | null
          last_seen_at: Date
          created_at: Date
        }>
      >`
        SELECT id, user_id, expires_at, ip, user_agent, last_seen_at, created_at
          FROM auth.sessions
         WHERE id = ${sessionId}
         LIMIT 1
      `
      const r = rows[0]
      if (!r) return null
      const row: Session = {
        id: r.id,
        userId: r.user_id,
        expiresAt: new Date(r.expires_at),
        ip: r.ip,
        userAgent: r.user_agent,
        lastSeenAt: new Date(r.last_seen_at),
        createdAt: new Date(r.created_at),
      }
      return row
    },
    async insert({ id, userId, expiresAt, ip, userAgent }) {
      await sql`
        INSERT INTO auth.sessions (id, user_id, expires_at, ip, user_agent)
        VALUES (${id}, ${userId}, ${expiresAt}, ${ip}, ${userAgent})
      `
    },
    async delete(sessionId) {
      await sql`DELETE FROM auth.sessions WHERE id = ${sessionId}`
    },
  }
}

export type PostgresSessionStore = ReturnType<typeof createSessionStore>
