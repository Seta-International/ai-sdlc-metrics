import type { TaskFlatWithPlan } from '../../lib/task-flat.types'

export function mapProgress(p: number): TaskFlatWithPlan['progress'] {
  if (p === 100) return 'completed'
  if (p === 50) return 'in-progress'
  return 'not-started'
}

export function mapPriority(p: number): TaskFlatWithPlan['priority'] {
  if (p === 1) return 'urgent'
  if (p === 3) return 'important'
  if (p === 9) return 'low'
  return 'medium'
}
