export const SYNCABLE_TASK_FIELDS = [
  'title',
  'bucketId',
  'percentComplete',
  'priority',
  'startDate',
  'dueDate',
  'completedDate',
  'assignees',
  'appliedCategories',
  'orderHint',
  'assigneePriority',
  'description',
  'checklist',
  'references',
  'previewType',
  'attachments',
] as const
export type SyncableTaskField = (typeof SYNCABLE_TASK_FIELDS)[number]

export const SYNCABLE_PLAN_FIELDS = ['title'] as const
export type SyncablePlanField = (typeof SYNCABLE_PLAN_FIELDS)[number]

export const SYNCABLE_BUCKET_FIELDS = ['name', 'orderHint'] as const
export type SyncableBucketField = (typeof SYNCABLE_BUCKET_FIELDS)[number]

export type EventOrigin = 'user' | 'api' | 'ms-sync-pull' | 'ms-sync-backfill' | 'ms-sync-push'
