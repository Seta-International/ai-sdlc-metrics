import { randomUUID } from 'node:crypto'
import type { KernelMessage } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import type { TransactionSql } from 'postgres'

export async function ensureThread(
  tx: TransactionSql,
  tenantId: string,
  threadId: string,
): Promise<{ resourceId: string | null }> {
  const userId = tenantContext.getUserId() ?? null
  await tx`
    INSERT INTO agent_memory.conversations (id, tenant_id, resource_id)
    VALUES (${threadId}, ${tenantId}, ${userId})
    ON CONFLICT (id) DO NOTHING
  `
  const rows = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.conversations WHERE id = ${threadId} LIMIT 1
  `
  return { resourceId: rows[0]?.resource_id ?? null }
}

export async function saveMessages(
  tx: TransactionSql,
  tenantId: string,
  threadId: string,
  msgs: KernelMessage[],
): Promise<number> {
  const filtered = msgs
    .filter((m) => m.role !== 'system')
    .map((m) => ({ ...m, id: m.id ?? randomUUID() }))
  if (filtered.length === 0) return 0

  const t = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.conversations WHERE id = ${threadId} LIMIT 1
  `
  const resourceId = t[0]?.resource_id ?? null

  const rows = filtered.map((m) => ({
    id: m.id as string,
    thread_id: threadId,
    tenant_id: tenantId,
    resource_id: resourceId,
    role: m.role,
    content: tx.json(m.content as never),
    tool_call_id: m.toolCallId ?? null,
  }))

  const inserted = await tx<Array<{ id: string }>>`
    INSERT INTO agent_memory.turns ${tx(
      rows,
      'id',
      'thread_id',
      'tenant_id',
      'resource_id',
      'role',
      'content',
      'tool_call_id',
    )}
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `

  if (inserted.length > 0) {
    await tx`
      UPDATE agent_memory.conversations
      SET message_count = message_count + ${inserted.length}, updated_at = now()
      WHERE id = ${threadId}
    `
  }

  return inserted.length
}
