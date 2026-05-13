import { createPool, type DbSql } from '@seta/db'

const URL = process.env.DATABASE_URL
if (!URL) throw new Error('integration tests require DATABASE_URL')

let pool: DbSql | null = null
export function getPool(): DbSql {
  if (!pool) pool = createPool(URL!, { max: 5 })
  return pool
}

export async function clearAgentWorkflows(sql: DbSql): Promise<void> {
  await sql`DELETE FROM agent_workflows.workflow_steps`
  await sql`DELETE FROM agent_workflows.workflow_snapshots`
}

export async function clearAuditFor(
  sql: DbSql,
  tenantId: string,
  workflowId: string,
): Promise<void> {
  await sql`DELETE FROM audit.audit_log WHERE tenant_id = ${tenantId} AND metadata->>'workflowId' = ${workflowId}`
}
