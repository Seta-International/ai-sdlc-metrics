import type { TaskFlatWithPlan } from '../../lib/task-flat.types'

export type MyDayTask = TaskFlatWithPlan & {
  myDay: {
    addedAt: string // ISO timestamp
    completedAt: string | null
  }
}
