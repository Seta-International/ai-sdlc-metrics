import { eq, sql } from 'drizzle-orm'
import { type NewWorkflowSnapshot, type WorkflowSnapshotRow, workflowSnapshots } from '../schema'

// Drizzle's transaction type is structural; the persistence helpers only
// rely on select/insert/update so we type the input as a minimal shape.
export interface DrizzleTx {
  select(): {
    from(table: typeof workflowSnapshots): {
      where(cond: unknown): {
        limit(n: number): Promise<WorkflowSnapshotRow[]>
      }
    }
  }
  insert(table: typeof workflowSnapshots): {
    values(row: NewWorkflowSnapshot): Promise<unknown>
  }
  update(table: typeof workflowSnapshots): {
    set(patch: Partial<NewWorkflowSnapshot>): {
      where(cond: unknown): Promise<unknown>
    }
  }
}

export async function insertSnapshot(tx: DrizzleTx, row: NewWorkflowSnapshot): Promise<void> {
  await tx.insert(workflowSnapshots).values(row)
}

export async function readSnapshot(
  tx: DrizzleTx,
  runId: string,
): Promise<WorkflowSnapshotRow | null> {
  const rows = await tx
    .select()
    .from(workflowSnapshots)
    .where(eq(workflowSnapshots.runId, runId))
    .limit(1)
  return rows[0] ?? null
}

export async function updateSnapshot(
  tx: DrizzleTx,
  runId: string,
  patch: Partial<NewWorkflowSnapshot>,
): Promise<void> {
  await tx
    .update(workflowSnapshots)
    .set({ ...patch, updatedAt: sql`now()` as never })
    .where(eq(workflowSnapshots.runId, runId))
}
