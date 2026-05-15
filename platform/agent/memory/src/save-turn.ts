import { randomUUID } from 'node:crypto'
import type { KernelMessage, KernelMessageContent } from '@seta/agent-core'
import { tenantContext } from '@seta/tenancy'
import type { TransactionSql } from 'postgres'

export function extractAutoTitle(msgs: KernelMessage[]): string | null {
  const userMsg = msgs.find((m) => m.role === 'user')
  if (!userMsg) return null
  const textPart = userMsg.content.find(
    (c): c is Extract<KernelMessageContent, { type: 'text' }> => c.type === 'text',
  )
  const text = textPart?.text.trim() ?? ''
  if (!text) return null
  return text.length <= 80 ? text : `${text.slice(0, 77)}...`
}

export async function ensureThread(
  tx: TransactionSql,
  tenantId: string,
  threadId: string,
  autoTitle?: string,
): Promise<{ resourceId: string | null }> {
  const userId = tenantContext.getUserId() ?? null
  await tx`
    INSERT INTO agent_memory.threads (id, tenant_id, resource_id, title)
    VALUES (${threadId}, ${tenantId}, ${userId}, ${autoTitle ?? null})
    ON CONFLICT (id) DO NOTHING
  `
  const rows = await tx<Array<{ resource_id: string | null }>>`
    SELECT resource_id FROM agent_memory.threads WHERE id = ${threadId} LIMIT 1
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
    SELECT resource_id FROM agent_memory.threads WHERE id = ${threadId} LIMIT 1
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
    INSERT INTO agent_memory.messages ${tx(
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
      UPDATE agent_memory.threads
      SET message_count = message_count + ${inserted.length}, updated_at = now()
      WHERE id = ${threadId}
    `
  }

  return inserted.length
}
