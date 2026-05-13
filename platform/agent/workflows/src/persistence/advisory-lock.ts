import type { TransactionSql } from 'postgres'

/**
 * Run-scoped advisory lock. Held until tx commit/rollback.
 * Two concurrent callers cannot both hold the lock for the same run_id.
 */
export async function tryAcquireRunLock(tx: TransactionSql, runId: string): Promise<boolean> {
  const rows = await tx<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(hashtext(${runId})) AS acquired
  `
  return rows[0]?.acquired === true
}
