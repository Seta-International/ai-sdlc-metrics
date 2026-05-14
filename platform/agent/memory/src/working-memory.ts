import type { TransactionSql } from 'postgres'
import { WorkingMemoryTooLargeError } from './errors'

export const WORKING_MEMORY_BYTE_CAP = 8192

export function validateWorkingMemoryText(text: string): void {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > WORKING_MEMORY_BYTE_CAP) {
    throw new WorkingMemoryTooLargeError(bytes)
  }
}

export async function readWorkingMemory(
  tx: TransactionSql,
  _tenantId: string,
  threadId: string,
): Promise<{ resourceId: string | null; workingMemory: string | null }> {
  const trows = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.threads WHERE id = ${threadId} LIMIT 1
  `
  const t = trows[0]
  if (!t?.resource_id) return { resourceId: null, workingMemory: null }

  const rrows = await tx<Array<{ working_memory: string | null }>>`
    SELECT working_memory FROM agent_memory.resources WHERE id = ${t.resource_id} LIMIT 1
  `
  return { resourceId: t.resource_id, workingMemory: rrows[0]?.working_memory ?? null }
}

export type UpsertWorkingMemoryResult =
  | { skipped: false; resourceId: string }
  | { skipped: true; reason: 'no_resource_id' | 'no_user_id' }

/** Resource-scoped read: bypasses the threads JOIN, looks up by resourceId directly. */
export async function readWorkingMemoryByResource(
  tx: TransactionSql,
  _tenantId: string,
  resourceId: string,
): Promise<string | null> {
  const rows = await tx<Array<{ working_memory: string | null }>>`
    SELECT working_memory FROM agent_memory.resources WHERE id = ${resourceId} LIMIT 1
  `
  return rows[0]?.working_memory ?? null
}

/** Resource-scoped upsert: writes directly to resources by resourceId, no thread required. */
export async function upsertWorkingMemoryByResource(
  tx: TransactionSql,
  tenantId: string,
  resourceId: string,
  text: string,
): Promise<void> {
  validateWorkingMemoryText(text)
  await tx`
    INSERT INTO agent_memory.resources (id, tenant_id, working_memory, updated_at)
    VALUES (${resourceId}, ${tenantId}, ${text}, now())
    ON CONFLICT (id) DO UPDATE
      SET working_memory = EXCLUDED.working_memory,
          updated_at     = now()
  `
}

export async function upsertWorkingMemory(
  tx: TransactionSql,
  tenantId: string,
  threadId: string,
  text: string,
): Promise<UpsertWorkingMemoryResult> {
  validateWorkingMemoryText(text)

  const trows = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.threads WHERE id = ${threadId} LIMIT 1
  `
  const t = trows[0]
  if (!t?.resource_id) {
    return { skipped: true, reason: 'no_resource_id' }
  }

  await tx`
    INSERT INTO agent_memory.resources (id, tenant_id, working_memory, updated_at)
    VALUES (${t.resource_id}, ${tenantId}, ${text}, now())
    ON CONFLICT (id) DO UPDATE
      SET working_memory = EXCLUDED.working_memory,
          updated_at = now()
  `

  return { skipped: false, resourceId: t.resource_id }
}
