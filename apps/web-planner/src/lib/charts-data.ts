import type { TaskFlat } from '@future/api-client/planner'

export type ProgressCounts = Record<TaskFlat['progress'], number>
export type PriorityCounts = Record<TaskFlat['priority'], number>

export function reduceProgress(tasks: TaskFlat[]): ProgressCounts {
  const out: ProgressCounts = { 'not-started': 0, 'in-progress': 0, completed: 0 }
  for (const t of tasks) out[t.progress] += 1
  return out
}

export function reducePriority(tasks: TaskFlat[]): PriorityCounts {
  const out: PriorityCounts = { urgent: 0, important: 0, medium: 0, low: 0 }
  for (const t of tasks) out[t.priority] += 1
  return out
}

export type BucketRow = { bucketId: string; bucketName: string; count: number; hint: string }

export function reduceBucket(tasks: TaskFlat[]): BucketRow[] {
  const byId = new Map<string, { bucketName: string; count: number; hint: string }>()
  for (const t of tasks) {
    const e = byId.get(t.bucketId)
    if (e) e.count += 1
    else byId.set(t.bucketId, { bucketName: t.bucketName, count: 1, hint: t.bucketOrderHint })
  }
  return [...byId.entries()]
    .map(([bucketId, v]) => ({ bucketId, ...v }))
    .sort((a, b) => (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0))
}

export type WorkloadRow = {
  actorId: string
  displayName: string
  avatarUrl: string | null
  total: number
  perPriority: PriorityCounts
}

export function reduceWorkloadByAssignee(tasks: TaskFlat[]): WorkloadRow[] {
  const byId = new Map<string, WorkloadRow>()
  for (const t of tasks) {
    if (t.progress === 'completed') continue
    for (const a of t.assignees) {
      let row = byId.get(a.actorId)
      if (!row) {
        row = {
          actorId: a.actorId,
          displayName: a.displayName,
          avatarUrl: a.avatarUrl,
          total: 0,
          perPriority: { urgent: 0, important: 0, medium: 0, low: 0 },
        }
        byId.set(a.actorId, row)
      }
      row.total += 1
      row.perPriority[t.priority] += 1
    }
  }
  return [...byId.values()].sort((a, b) => b.total - a.total)
}

export function reduceLateUpcoming(
  tasks: TaskFlat[],
  now: Date = new Date(),
): {
  late: TaskFlat[]
  upcoming: TaskFlat[]
} {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const weekOut = today + 7 * 86_400_000
  const late = tasks
    .filter((t) => t.dueDate && new Date(t.dueDate).getTime() < today && t.progress !== 'completed')
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)
  const upcoming = tasks
    .filter((t) => {
      if (!t.dueDate || t.progress === 'completed') return false
      const ms = new Date(t.dueDate).getTime()
      return ms >= today && ms <= weekOut
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)
  return { late, upcoming }
}
