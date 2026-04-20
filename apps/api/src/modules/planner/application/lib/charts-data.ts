import type {
  TaskFlatWithPlan,
  PlannerChartsData,
  ProgressCounts,
  PriorityCounts,
  BucketRow,
  WorkloadRow,
} from './task-flat.types'

export function computePlannerChartsData(
  tasks: TaskFlatWithPlan[],
  now: Date = new Date(),
): PlannerChartsData {
  const progress: ProgressCounts = { 'not-started': 0, 'in-progress': 0, completed: 0 }
  const priority: PriorityCounts = { urgent: 0, important: 0, medium: 0, low: 0 }
  const bucketMap = new Map<string, { bucketName: string; count: number; hint: string }>()
  const workloadMap = new Map<string, WorkloadRow>()

  for (const t of tasks) {
    progress[t.progress] += 1
    priority[t.priority] += 1

    const b = bucketMap.get(t.bucketId)
    if (b) b.count += 1
    else bucketMap.set(t.bucketId, { bucketName: t.bucketName, count: 1, hint: t.bucketOrderHint })

    if (t.progress !== 'completed') {
      for (const a of t.assignees) {
        let row = workloadMap.get(a.actorId)
        if (!row) {
          row = {
            actorId: a.actorId,
            displayName: a.displayName,
            avatarUrl: a.avatarUrl,
            total: 0,
            perPriority: { urgent: 0, important: 0, medium: 0, low: 0 },
          }
          workloadMap.set(a.actorId, row)
        }
        row.total += 1
        row.perPriority[t.priority] += 1
      }
    }
  }

  const bucket: BucketRow[] = [...bucketMap.entries()]
    .map(([bucketId, v]) => ({ bucketId, ...v }))
    .sort((a, b) => (a.hint < b.hint ? -1 : a.hint > b.hint ? 1 : 0))

  const workload: WorkloadRow[] = [...workloadMap.values()].sort((a, b) => b.total - a.total)

  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const weekOutMs = todayMs + 7 * 86_400_000
  const late = tasks
    .filter(
      (t) => t.dueDate && new Date(t.dueDate).getTime() < todayMs && t.progress !== 'completed',
    )
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)
  const upcoming = tasks
    .filter((t) => {
      if (!t.dueDate || t.progress === 'completed') return false
      const ms = new Date(t.dueDate).getTime()
      return ms >= todayMs && ms <= weekOutMs
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5)

  return { progress, priority, bucket, workload, lateUpcoming: { late, upcoming } }
}
