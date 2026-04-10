import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
  })
  pool.on('error', (err) => {
    console.error('Unexpected idle pool client error', err)
  })
  return drizzle(pool)
}

export type Db = ReturnType<typeof createDb>
