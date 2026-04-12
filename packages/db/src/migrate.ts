import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import path from 'path'

const MIGRATIONS_DIR = path.join(__dirname, '../drizzle/migrations')

// Arbitrary stable lock key — all instances compete for this advisory lock
// so only one runs migrations at a time; the others wait and proceed once
// the lock is released (migrations already applied, so a no-op).
const MIGRATION_LOCK_KEY = 1_000_000_007

export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString ?? process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: url })

  const client = await pool.connect()
  try {
    // Acquire session-level advisory lock — blocks until available, released on disconnect.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    console.log('[db] migrations complete')
  } finally {
    // pg_advisory_unlock is redundant here (session end releases it) but is explicit.
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {})
    client.release()
    await pool.end()
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('[db] migration failed:', err)
    process.exit(1)
  })
}
