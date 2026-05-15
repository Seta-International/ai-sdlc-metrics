import type { BatchResponseItem } from '@seta/connector-ms365-planner'

export type OpStatus = 'ok' | 'conflict' | 'forbidden' | 'missing' | 'rate_limited' | 'failed'
export interface OpResult {
  taskId: string
  status: OpStatus
  newEtag?: string | null
  raw?: unknown
  reason?: string
}

export function classifyBatchItem(item: BatchResponseItem & { taskId?: string }): OpResult {
  const taskId = item.taskId ?? item.id
  if (item.status >= 200 && item.status < 300)
    return { taskId, status: 'ok', newEtag: item.etag, raw: item.body }
  if (item.status === 412)
    return { taskId, status: 'conflict', reason: 'task changed since you looked' }
  if (item.status === 403)
    return { taskId, status: 'forbidden', reason: 'you no longer have access' }
  if (item.status === 404) return { taskId, status: 'missing', reason: 'task no longer exists' }
  if (item.status === 429)
    return { taskId, status: 'rate_limited', reason: 'try again in a moment' }
  return { taskId, status: 'failed', reason: `graph status ${item.status}` }
}
