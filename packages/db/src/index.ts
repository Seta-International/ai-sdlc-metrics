import { drizzle, type NodePgClient } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export type Db = ReturnType<typeof drizzle>
export type DbClient = NodePgClient

export function createDb(connectionString: string): Db
export function createDb(client: DbClient): Db
export function createDb(connectionStringOrClient: string | DbClient): Db {
  if (typeof connectionStringOrClient !== 'string') {
    return drizzle(connectionStringOrClient)
  }

  const pool = new Pool({
    connectionString: connectionStringOrClient,
    max: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
  })
  pool.on('error', (err) => {
    console.error('Unexpected idle pool client error', err)
  })
  return drizzle(pool)
}
