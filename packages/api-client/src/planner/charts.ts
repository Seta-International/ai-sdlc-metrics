import type { TaskFlat, TaskFlatWithPlan } from './task-flat'

export type ProgressCounts = Record<TaskFlat['progress'], number>
export type PriorityCounts = Record<TaskFlat['priority'], number>

export interface BucketRow {
  bucketId: string
  bucketName: string
  count: number
  hint: string
}

export interface WorkloadRow {
  actorId: string
  displayName: string
  avatarUrl: string | null
  total: number
  perPriority: PriorityCounts
}

export interface PlannerChartsData {
  progress: ProgressCounts
  priority: PriorityCounts
  bucket: BucketRow[]
  workload: WorkloadRow[]
  lateUpcoming: { late: TaskFlatWithPlan[]; upcoming: TaskFlatWithPlan[] }
}
