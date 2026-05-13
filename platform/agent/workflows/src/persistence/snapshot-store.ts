import type { TransactionSql } from 'postgres'
import type {
  NewWorkflowSnapshot,
  ResumeLabelRef,
  SerializedError,
  SerializedStepGraph,
  StepResultRow,
  WorkflowSnapshotRow,
} from '../schema'

interface SnapshotDbRow {
  run_id: string
  tenant_id: string
  workflow_id: string
  run_input: unknown
  serialized_step_graph: SerializedStepGraph
  active_paths: number[]
  suspended_paths: Record<string, number[]>
  step_results: Record<string, StepResultRow>
  resume_labels: Record<string, ResumeLabelRef>
  status: 'running' | 'suspended' | 'completed' | 'failed' | 'bailed'
  error: SerializedError | null
  created_at: Date
  updated_at: Date
}

function rowToSnapshot(row: SnapshotDbRow): WorkflowSnapshotRow {
  return {
    runId: row.run_id,
    tenantId: row.tenant_id,
    workflowId: row.workflow_id,
    runInput: row.run_input,
    serializedStepGraph: row.serialized_step_graph,
    activePaths: row.active_paths,
    suspendedPaths: row.suspended_paths,
    stepResults: row.step_results,
    resumeLabels: row.resume_labels,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function insertSnapshot(tx: TransactionSql, row: NewWorkflowSnapshot): Promise<void> {
  await tx`
    INSERT INTO agent_workflows.workflow_snapshots
      (run_id, tenant_id, workflow_id, run_input, serialized_step_graph,
       active_paths, suspended_paths, step_results, resume_labels, status, error)
    VALUES (
      ${row.runId},
      ${row.tenantId},
      ${row.workflowId},
      ${tx.json(row.runInput as never)},
      ${tx.json(row.serializedStepGraph as never)},
      ${tx.json(row.activePaths as never)},
      ${tx.json(row.suspendedPaths as never)},
      ${tx.json(row.stepResults as never)},
      ${tx.json(row.resumeLabels as never)},
      ${row.status},
      ${row.error ? tx.json(row.error as never) : null}
    )
  `
}

export async function readSnapshot(
  tx: TransactionSql,
  runId: string,
): Promise<WorkflowSnapshotRow | null> {
  const rows = await tx<SnapshotDbRow[]>`
    SELECT * FROM agent_workflows.workflow_snapshots
    WHERE run_id = ${runId}
    LIMIT 1
  `
  return rows[0] ? rowToSnapshot(rows[0]) : null
}

export type SnapshotPatch = Partial<{
  status: 'running' | 'suspended' | 'completed' | 'failed' | 'bailed'
  activePaths: number[]
  suspendedPaths: Record<string, number[]>
  stepResults: Record<string, StepResultRow>
  resumeLabels: Record<string, ResumeLabelRef>
  error: SerializedError | null
}>

export async function updateSnapshot(
  tx: TransactionSql,
  runId: string,
  patch: SnapshotPatch,
): Promise<void> {
  const setClauses: string[] = []
  const values: unknown[] = []
  if (patch.status !== undefined) {
    setClauses.push('status')
    values.push(patch.status)
  }
  if (patch.activePaths !== undefined) {
    setClauses.push('active_paths')
    values.push(tx.json(patch.activePaths as never))
  }
  if (patch.suspendedPaths !== undefined) {
    setClauses.push('suspended_paths')
    values.push(tx.json(patch.suspendedPaths as never))
  }
  if (patch.stepResults !== undefined) {
    setClauses.push('step_results')
    values.push(tx.json(patch.stepResults as never))
  }
  if (patch.resumeLabels !== undefined) {
    setClauses.push('resume_labels')
    values.push(tx.json(patch.resumeLabels as never))
  }
  if (patch.error !== undefined) {
    setClauses.push('error')
    values.push(patch.error ? tx.json(patch.error as never) : null)
  }
  if (setClauses.length === 0) return

  // postgres-js doesn't support tagged composition mid-template; build the
  // UPDATE statement by emitting one query per patched column. The advisory
  // lock around the caller's tx serialises this — order doesn't matter.
  if (patch.status !== undefined) {
    await tx`UPDATE agent_workflows.workflow_snapshots SET status = ${patch.status}, updated_at = now() WHERE run_id = ${runId}`
  }
  if (patch.activePaths !== undefined) {
    await tx`UPDATE agent_workflows.workflow_snapshots SET active_paths = ${tx.json(patch.activePaths as never)}, updated_at = now() WHERE run_id = ${runId}`
  }
  if (patch.suspendedPaths !== undefined) {
    await tx`UPDATE agent_workflows.workflow_snapshots SET suspended_paths = ${tx.json(patch.suspendedPaths as never)}, updated_at = now() WHERE run_id = ${runId}`
  }
  if (patch.stepResults !== undefined) {
    await tx`UPDATE agent_workflows.workflow_snapshots SET step_results = ${tx.json(patch.stepResults as never)}, updated_at = now() WHERE run_id = ${runId}`
  }
  if (patch.resumeLabels !== undefined) {
    await tx`UPDATE agent_workflows.workflow_snapshots SET resume_labels = ${tx.json(patch.resumeLabels as never)}, updated_at = now() WHERE run_id = ${runId}`
  }
  if (patch.error !== undefined) {
    if (patch.error === null) {
      await tx`UPDATE agent_workflows.workflow_snapshots SET error = NULL, updated_at = now() WHERE run_id = ${runId}`
    } else {
      await tx`UPDATE agent_workflows.workflow_snapshots SET error = ${tx.json(patch.error as never)}, updated_at = now() WHERE run_id = ${runId}`
    }
  }
}
