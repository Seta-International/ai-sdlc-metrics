import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import path from 'path'

const MIGRATIONS_DIR = path.join(__dirname, '../drizzle/migrations')

export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString ?? process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool)

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    console.log('[db] migrations complete')
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('[db] migration failed:', err)
    process.exit(1)
  })
}
