import type { KernelMessage } from '@seta/agent-core'
import { getEncoding } from 'js-tiktoken'

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
