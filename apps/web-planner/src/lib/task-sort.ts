import type { TaskFlat } from './task-types'
import type { SortField } from './view-state'

export type SortInput = { field: SortField; dir: 'asc' | 'desc' }

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  important: 1,
  medium: 2,
  low: 3,
}

const PROGRESS_RANK: Record<string, number> = {
  'not-started': 0,
  'in-progress': 1,
  completed: 2,
}

export function sortTasks(tasks: TaskFlat[], sort: SortInput): TaskFlat[] {
  const sign = sort.dir === 'asc' ? 1 : -1

  return [...tasks].sort((a, b) => {
    const primary = compare(a, b, sort.field, sign)
    if (primary !== 0) return primary
    // stable tie-break: orderHint, always ascending
    return a.orderHint.localeCompare(b.orderHint)
  })
}

function compare(a: TaskFlat, b: TaskFlat, field: SortField, sign: number): number {
  switch (field) {
    case 'title':
    case 'bucket':
      return sign * getValue(a, field).localeCompare(getValue(b, field))

    case 'priority':
      return sign * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])

    case 'progress':
      return sign * (PROGRESS_RANK[a.progress] - PROGRESS_RANK[b.progress])

    case 'start':
    case 'due': {
      const aDate = field === 'start' ? a.startDate : a.dueDate
      const bDate = field === 'start' ? b.startDate : b.dueDate
      // nulls always last regardless of direction
      if (aDate === null && bDate === null) return 0
      if (aDate === null) return 1
      if (bDate === null) return -1
      return sign * (new Date(aDate).getTime() - new Date(bDate).getTime())
    }

    case 'updated':
      return sign * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
  }
}

function getValue(t: TaskFlat, field: 'title' | 'bucket'): string {
  return field === 'title' ? t.title : t.bucketName
}
