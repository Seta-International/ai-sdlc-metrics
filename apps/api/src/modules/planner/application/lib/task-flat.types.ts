/**
 * Planner shared types — defined here in apps/api so the planner module
 * never needs to import from @future/api-client (which would create a
 * circular dependency). @future/api-client/planner re-exports compatible
 * definitions for frontend use.
 */

export type TaskFlat = {
  id: string
  planId: string
  bucketId: string
  bucketName: string
  bucketOrderHint: string
  title: string
  progress: 'not-started' | 'in-progress' | 'completed'
  priority: 'urgent' | 'important' | 'medium' | 'low'
  startDate: string | null
  dueDate: string | null
  assignees: { actorId: string; displayName: string; avatarUrl: string | null }[]
  labels: { id: string; name: string; color: string }[]
  orderHint: string
  commentCount: number
  checklistCount: { total: number; completed: number }
  attachmentCount: number
  createdAt: string
  updatedAt: string
}

export type TaskFlatWithPlan = TaskFlat & {
  planName: string
  planKind: 'team' | 'personal'
}

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
