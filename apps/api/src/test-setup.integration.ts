import { afterAll } from 'vitest'
import { createTestDb } from '@future/db/test-helpers'

const db = createTestDb()

afterAll(async () => {
  // Close the connection pool after all integration tests complete
  const pool = (db as unknown as { $client: { end: () => Promise<void> } }).$client
  if (pool?.end) await pool.end()
})
