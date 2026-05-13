import type { TransactionSql } from 'postgres'

export async function readWorkingMemory(
  tx: TransactionSql,
  _tenantId: string,
  threadId: string,
): Promise<{ resourceId: string | null; workingMemory: string | null }> {
  const trows = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.conversations WHERE id = ${threadId} LIMIT 1
  `
  const t = trows[0]
  if (!t?.resource_id) return { resourceId: null, workingMemory: null }

  const rrows = await tx<Array<{ working_memory: string | null }>>`
    SELECT working_memory FROM agent_memory.working_memory WHERE id = ${t.resource_id} LIMIT 1
  `
  return { resourceId: t.resource_id, workingMemory: rrows[0]?.working_memory ?? null }
}

export type UpsertWorkingMemoryResult =
  | { skipped: false; resourceId: string }
  | { skipped: true; reason: 'no_resource_id' }

export async function upsertWorkingMemory(
  tx: TransactionSql,
  tenantId: string,
  threadId: string,
  text: string,
): Promise<UpsertWorkingMemoryResult> {
  const trows = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.conversations WHERE id = ${threadId} LIMIT 1
  `
  const t = trows[0]
  if (!t?.resource_id) {
    return { skipped: true, reason: 'no_resource_id' }
  }

  await tx`
    INSERT INTO agent_memory.working_memory (id, tenant_id, working_memory, updated_at)
    VALUES (${t.resource_id}, ${tenantId}, ${text}, now())
    ON CONFLICT (id) DO UPDATE
      SET working_memory = EXCLUDED.working_memory,
          updated_at = now()
  `

  return { skipped: false, resourceId: t.resource_id }
}
