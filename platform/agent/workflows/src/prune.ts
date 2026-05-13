import type { DbSql } from '@seta/db'
import { WorkflowError } from './errors'

let sqlRef: DbSql | null = null

export function setPruneSql(sql: DbSql | null): void {
  sqlRef = sql
}

/**
 * P1 ops surface — not invoked automatically. Wire from a cron job when
 * storage growth becomes a documented concern (setup.md §3 scaling triggers).
 *
 * Deletes terminal (completed/failed/bailed) snapshot rows + their step
 * rows older than `olderThan`. Suspended runs are NEVER pruned.
 */
export async function pruneCompletedSnapshots(opts: {
  olderThan: Date
  batchSize?: number
}): Promise<{ pruned: number }> {
  if (!sqlRef) {
    throw new WorkflowError(500, 'prune not configured: call setPruneSql() at boot')
  }
  const batchSize = opts.batchSize ?? 500
  const cutoff = opts.olderThan.toISOString()
  const sql = sqlRef

  const deleted = await sql<Array<{ run_id: string }>>`
    WITH targets AS (
      SELECT run_id
      FROM agent_workflows.workflow_snapshots
      WHERE status IN ('completed', 'failed', 'bailed')
        AND updated_at < ${cutoff}
      LIMIT ${batchSize}
    ),
    step_del AS (
      DELETE FROM agent_workflows.workflow_steps
      WHERE run_id IN (SELECT run_id FROM targets)
      RETURNING 1
    )
    DELETE FROM agent_workflows.workflow_snapshots
    WHERE run_id IN (SELECT run_id FROM targets)
    RETURNING run_id
  `

  return { pruned: deleted.length }
}
