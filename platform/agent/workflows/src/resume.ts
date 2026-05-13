import { type DbSql, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { ResumeParams, RunOpts } from './create-workflow'
import { WorkflowError, WorkflowNotRegistered, WorkflowSnapshotNotFound } from './errors'
import { type DrizzleTx, readSnapshot } from './persistence/snapshot-store'
import { workflowRegistry } from './registry'
import type { RunResult } from './types/result'

let sqlRef: DbSql | null = null

export function setResumeSql(sql: DbSql | null): void {
  sqlRef = sql
}

function getSql(): DbSql {
  if (!sqlRef) {
    throw new WorkflowError(500, 'resume not configured: call setResumeSql() at boot')
  }
  return sqlRef
}

async function lookupSnapshotWorkflowId(runId: string): Promise<string | null> {
  const sql = getSql()
  const tenantId = tenantContext.getTenantId()
  return withTenant(sql, tenantId, async (tx) => {
    const cx = drizzle(tx as never) as unknown as DrizzleTx
    const snap = await readSnapshot(cx, runId)
    return snap?.workflowId ?? null
  })
}

export async function resumeWorkflow<TPayload = unknown>(
  runId: string,
  params: ResumeParams<TPayload>,
  opts?: RunOpts,
): Promise<RunResult<unknown>> {
  const workflowId = await lookupSnapshotWorkflowId(runId)
  if (!workflowId) throw new WorkflowSnapshotNotFound(runId)
  const wf = workflowRegistry.get(workflowId)
  if (!wf) throw new WorkflowNotRegistered(workflowId)
  return wf.resume(runId, params, opts)
}

export async function resumeWorkflowAsync<TPayload = unknown>(
  runId: string,
  params: ResumeParams<TPayload>,
  opts?: RunOpts,
): Promise<{ runId: string }> {
  const workflowId = await lookupSnapshotWorkflowId(runId)
  if (!workflowId) throw new WorkflowSnapshotNotFound(runId)
  const wf = workflowRegistry.get(workflowId)
  if (!wf) throw new WorkflowNotRegistered(workflowId)
  return wf.resumeAsync(runId, params, opts)
}
