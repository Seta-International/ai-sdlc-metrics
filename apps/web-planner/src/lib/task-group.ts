import type { TaskFlat } from './task-types'
import type { GroupKey } from './view-state'
import { startOfDay, addDays } from './date-utils'

export type TaskGroup = { key: string; label: string; tasks: TaskFlat[] }

export function groupTasks(
  tasks: TaskFlat[],
  groupBy: GroupKey,
  now: Date = new Date(),
): TaskGroup[] {
  switch (groupBy) {
    case 'bucket':
      return groupByBucket(tasks)
    case 'progress':
      return groupByProgress(tasks)
    case 'due':
      return groupByDue(tasks, now)
    case 'priority':
      return groupByPriority(tasks)
    case 'assignee':
      return groupByAssignee(tasks)
    case 'label':
      return groupByLabel(tasks)
  }
}

function groupByBucket(tasks: TaskFlat[]): TaskGroup[] {
  const order: string[] = []
  const byId = new Map<string, { name: string; tasks: TaskFlat[] }>()
  for (const t of tasks) {
    if (!byId.has(t.bucketId)) {
      order.push(t.bucketId)
      byId.set(t.bucketId, { name: t.bucketName, tasks: [] })
    }
    byId.get(t.bucketId)!.tasks.push(t)
  }
  // sort by bucketOrderHint (stable — use first task seen per bucket)
  const hints = new Map(tasks.map((t) => [t.bucketId, t.bucketOrderHint]))
  return order
    .sort((a, b) => hints.get(a)!.localeCompare(hints.get(b)!))
    .map((id) => ({ key: id, label: byId.get(id)!.name, tasks: byId.get(id)!.tasks }))
}

const PROGRESS_ORDER = ['not-started', 'in-progress', 'completed'] as const
const PROGRESS_LABELS: Record<string, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
}

function groupByProgress(tasks: TaskFlat[]): TaskGroup[] {
  return PROGRESS_ORDER.map((p) => ({
    key: p,
    label: PROGRESS_LABELS[p]!,
    tasks: tasks.filter((t) => t.progress === p),
  }))
}

const PRIORITY_ORDER = ['urgent', 'important', 'medium', 'low'] as const
const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  important: 'Important',
  medium: 'Medium',
  low: 'Low',
}

function groupByPriority(tasks: TaskFlat[]): TaskGroup[] {
  return PRIORITY_ORDER.map((p) => ({
    key: p,
    label: PRIORITY_LABELS[p]!,
    tasks: tasks.filter((t) => t.priority === p),
  }))
}

const DUE_ORDER = ['late', 'today', 'tomorrow', 'this-week', 'next-week', 'future', 'none'] as const
const DUE_LABELS: Record<string, string> = {
  late: 'Late',
  today: 'Today',
  tomorrow: 'Tomorrow',
  'this-week': 'This week',
  'next-week': 'Next week',
  future: 'Future',
  none: 'No date',
}

// Groups are mutually exclusive: today/tomorrow are separate from this-week.
// The filter's this-week is intentionally inclusive (matches today + tomorrow too).
function groupByDue(tasks: TaskFlat[], now: Date): TaskGroup[] {
  const todayStart = startOfDay(now)
  const boundaries = {
    todayEnd: addDays(todayStart, 1),
    tomorrowEnd: addDays(todayStart, 2),
    thisWeekEnd: addDays(todayStart, 7),
    nextWeekEnd: addDays(todayStart, 14),
  }

  function bucketFor(t: TaskFlat): string {
    if (!t.dueDate) return 'none'
    const d = new Date(t.dueDate)
    if (d < todayStart) return 'late'
    if (d < boundaries.todayEnd) return 'today'
    if (d < boundaries.tomorrowEnd) return 'tomorrow'
    if (d < boundaries.thisWeekEnd) return 'this-week'
    if (d < boundaries.nextWeekEnd) return 'next-week'
    return 'future'
  }

  const byBucket = new Map<string, TaskFlat[]>(DUE_ORDER.map((k) => [k, []]))
  for (const t of tasks) byBucket.get(bucketFor(t))!.push(t)
  return DUE_ORDER.map((k) => ({ key: k, label: DUE_LABELS[k]!, tasks: byBucket.get(k)! }))
}

function groupByAssignee(tasks: TaskFlat[]): TaskGroup[] {
  const byId = new Map<string, { name: string; tasks: TaskFlat[] }>()
  for (const t of tasks) {
    if (t.assignees.length === 0) {
      const g = byId.get('__unassigned') ?? { name: 'Unassigned', tasks: [] }
      byId.set('__unassigned', g)
      g.tasks.push(t)
      continue
    }
    for (const a of t.assignees) {
      const existing = byId.get(a.actorId)
      if (existing) {
        existing.tasks.push(t)
      } else {
        byId.set(a.actorId, { name: a.name ?? 'Unknown', tasks: [t] })
      }
    }
  }
  return [...byId.entries()]
    .map(([key, v]) => ({ key, label: v.name, tasks: v.tasks }))
    .sort((a, b) =>
      a.key === '__unassigned' ? 1 : b.key === '__unassigned' ? -1 : a.label.localeCompare(b.label),
    )
}

function groupByLabel(tasks: TaskFlat[]): TaskGroup[] {
  const byId = new Map<string, { name: string; tasks: TaskFlat[] }>()
  for (const t of tasks) {
    if (t.labels.length === 0) {
      const g = byId.get('__nolabel') ?? { name: 'No label', tasks: [] }
      byId.set('__nolabel', g)
      g.tasks.push(t)
      continue
    }
    for (const l of t.labels) {
      const existing = byId.get(l.id)
      if (existing) {
        existing.tasks.push(t)
      } else {
        byId.set(l.id, { name: l.name, tasks: [t] })
      }
    }
  }
  return [...byId.entries()]
    .map(([key, v]) => ({ key, label: v.name, tasks: v.tasks }))
    .sort((a, b) =>
      a.key === '__nolabel' ? 1 : b.key === '__nolabel' ? -1 : a.label.localeCompare(b.label),
    )
}
