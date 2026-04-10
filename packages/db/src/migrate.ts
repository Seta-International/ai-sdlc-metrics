import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

async function runMigrations() {
  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString })
  const db = drizzle(pool)

  await migrate(db, { migrationsFolder: './drizzle/migrations' })
  await pool.end()
  console.log('Migrations complete')
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
