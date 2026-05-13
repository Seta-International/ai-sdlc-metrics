import { createPool, type DbSql } from '@seta/db'

const URL = process.env.DATABASE_URL
if (!URL) throw new Error('integration tests require DATABASE_URL')
const dbUrl: string = URL

// tenant_user: RLS-subject, used by the runner (matches production).
const TENANT_USER_URL = dbUrl.replace('seta:dev@', 'tenant_user:dev_only_change_me@')

// platform_admin: bypasses RLS, used for test inspection and cleanup
// (DELETE on audit.audit_log isn't granted to tenant_user).
const PLATFORM_ADMIN_URL = dbUrl.replace('seta:dev@', 'platform_admin:dev_only_change_me@')

let runnerPool: DbSql | null = null
export function getPool(): DbSql {
  if (!runnerPool) runnerPool = createPool(TENANT_USER_URL, { max: 5 })
  return runnerPool
}

let adminPool: DbSql | null = null
export function getAdminPool(): DbSql {
  if (!adminPool) adminPool = createPool(PLATFORM_ADMIN_URL, { max: 2 })
  return adminPool
}

export async function clearWorkflow(_sql: DbSql, workflowId: string): Promise<void> {
  const admin = getAdminPool()
  await admin`DELETE FROM agent_workflows.workflow_steps WHERE workflow_id = ${workflowId}`
  await admin`DELETE FROM agent_workflows.workflow_snapshots WHERE workflow_id = ${workflowId}`
  await admin`DELETE FROM audit.audit_log WHERE metadata->>'workflowId' = ${workflowId}`
}
