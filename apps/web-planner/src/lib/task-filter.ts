import type { TaskFlat } from '@future/api-client/planner'
import type { ViewState } from './view-state'
import { startOfDay, addDays } from './date-utils'

export type FilterInput = ViewState['filter']

export interface ApplyFilterOptions {
  includeCompleted?: boolean
  now?: Date
}

export function applyTaskFilter(
  tasks: TaskFlat[],
  filter: FilterInput,
  options: ApplyFilterOptions = {},
): TaskFlat[] {
  const includeCompleted = options.includeCompleted ?? true
  const now = options.now ?? new Date()

  const hasPriority = filter.priority.length > 0
  const hasLabels = filter.labels.length > 0
  const hasBuckets = filter.buckets.length > 0
  const hasAssignees = filter.assignees.length > 0

  const dueMatches = buildDueMatcher(filter.due, now)

  let out = tasks
  if (!includeCompleted) {
    out = out.filter((t) => t.progress !== 'completed')
  }

  return out.filter((t) => {
    if (dueMatches && !dueMatches(t.dueDate)) return false
    if (hasPriority && !filter.priority.includes(t.priority)) return false
    if (hasLabels && !t.labels.some((l) => filter.labels.includes(l.id))) return false
    if (hasBuckets && !filter.buckets.includes(t.bucketId)) return false
    if (hasAssignees && !t.assignees.some((a) => filter.assignees.includes(a.actorId))) return false
    return true
  })
}

function buildDueMatcher(
  due: FilterInput['due'],
  now: Date,
): ((iso: string | null) => boolean) | null {
  if (!due) return null
  const todayStart = startOfDay(now)
  const todayEnd = addDays(todayStart, 1)
  const tomorrowEnd = addDays(todayStart, 2)
  const thisWeekEnd = addDays(todayStart, 7)
  const nextWeekEnd = addDays(todayStart, 14)

  return (iso) => {
    if (due === 'none') return iso === null
    if (iso === null) return false
    const d = new Date(iso)
    switch (due) {
      case 'late':
        return d.getTime() < todayStart.getTime()
      case 'today':
        return d >= todayStart && d < todayEnd
      case 'tomorrow':
        return d >= todayEnd && d < tomorrowEnd
      case 'this-week':
        return d >= todayStart && d < thisWeekEnd
      case 'next-week':
        return d >= thisWeekEnd && d < nextWeekEnd
      case 'future':
        return d >= nextWeekEnd
      default:
        return false
    }
  }
}
