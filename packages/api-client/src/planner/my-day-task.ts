import type { TaskFlatWithPlan } from './task-flat'

export type MyDayTask = TaskFlatWithPlan & {
  myDay: {
    addedAt: string // ISO timestamp
    completedAt: string | null
  }
}
