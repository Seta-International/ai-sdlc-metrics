import type { TransactionSql } from 'postgres'
import { WorkingMemoryTooLargeError } from './errors'

export const WORKING_MEMORY_BYTE_CAP = 8192

export function validateWorkingMemoryText(text: string): void {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > WORKING_MEMORY_BYTE_CAP) {
    throw new WorkingMemoryTooLargeError(bytes)
  }
}

/** Thread-scoped read: reads working memory from threads.metadata->>'workingMemory'. */
export async function readWorkingMemory(
  tx: TransactionSql,
  _tenantId: string,
  threadId: string,
): Promise<{ workingMemory: string | null }> {
  const rows = await tx<Array<{ working_memory: string | null }>>`
    SELECT metadata->>'workingMemory' AS working_memory
    FROM agent_memory.threads
    WHERE id = ${threadId}
    LIMIT 1
  `
  return { workingMemory: rows[0]?.working_memory ?? null }
}

export type UpsertWorkingMemoryResult =
  | { skipped: false; threadId: string }
  | { skipped: true; reason: 'thread_not_found' | 'no_user_id' }

/** Thread-scoped upsert: merges working memory into threads.metadata. 8KB cap enforced. */
export async function upsertWorkingMemory(
  tx: TransactionSql,
  _tenantId: string,
  threadId: string,
  text: string,
): Promise<UpsertWorkingMemoryResult> {
  validateWorkingMemoryText(text)
  const rows = await tx<Array<{ id: string }>>`
    UPDATE agent_memory.threads
    SET metadata   = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('workingMemory', ${text}::text),
        updated_at = now()
    WHERE id = ${threadId}
    RETURNING id
  `
  if (!rows[0]) {
    return { skipped: true, reason: 'thread_not_found' }
  }
  return { skipped: false, threadId }
}

/** Resource-scoped read: looks up working memory by resourceId directly. */
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

/** Resource-scoped upsert: writes to resources.working_memory with 8KB cap enforced. */
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
