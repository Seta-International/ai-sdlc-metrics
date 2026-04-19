import type { TaskFlat } from '@future/api-client/planner'

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function StartCell({ task }: { task: TaskFlat }) {
  if (!task.startDate) {
    return <span className="text-xs text-fg-muted">—</span>
  }
  return <span className="text-xs">{formatDate(task.startDate)}</span>
}
