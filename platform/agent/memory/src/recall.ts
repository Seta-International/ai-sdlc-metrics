import type { KernelMessage, KernelMessageContent, KernelRole } from '@seta/agent-core'
import { getEncoding } from 'js-tiktoken'
import type { TransactionSql } from 'postgres'

const enc = getEncoding('o200k_base')

function countTokens(m: KernelMessage): number {
  return enc.encode(JSON.stringify(m.content)).length + 4
}

function findLastIndex<T>(arr: T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]
    if (v !== undefined && pred(v)) return i
  }
  return -1
}

export function trimToTokenBudget(
  msgs: KernelMessage[],
  budget: number,
): { kept: KernelMessage[]; droppedCount: number } {
  if (msgs.length === 0) return { kept: [], droppedCount: 0 }
  const sizes = msgs.map(countTokens)
  let total = sizes.reduce((a, b) => a + b, 0)
  let dropped = 0
  const lastUserIdx = findLastIndex(msgs, (m) => m.role === 'user')
  const floor = lastUserIdx >= 0 ? lastUserIdx : msgs.length - 1
  let i = 0
  while (total > budget && i < floor) {
    const size = sizes[i] ?? 0
    total -= size
    i++
    dropped++
  }
  return { kept: msgs.slice(i), droppedCount: dropped }
}

export interface RecallPage {
  messages: KernelMessage[]
  total: number
  hasMore: boolean
}

type RecallRow = {
  id: string
  role: string
  content: KernelMessageContent[]
  tool_call_id: string | null
}

export async function fetchRecallPage(
  tx: TransactionSql,
  threadId: string,
  pageSize: number,
): Promise<RecallPage> {
  const rows = await tx<RecallRow[]>`
    SELECT id, role, content, tool_call_id
    FROM agent_memory.messages
    WHERE thread_id = ${threadId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${pageSize + 1}
  `

  const hasMore = rows.length > pageSize
  const slice = (hasMore ? rows.slice(0, pageSize) : rows).reverse()

  const kmsgs: KernelMessage[] = slice.map((r) => ({
    id: r.id,
    role: r.role as KernelRole,
    content: r.content,
    ...(r.tool_call_id ? { toolCallId: r.tool_call_id } : {}),
  }))

  const trows = await tx<Array<{ message_count: number }>>`
    SELECT message_count FROM agent_memory.threads WHERE id = ${threadId} LIMIT 1
  `

  return { messages: kmsgs, total: trows[0]?.message_count ?? kmsgs.length, hasMore }
}
