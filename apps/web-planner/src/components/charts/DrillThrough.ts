import { serializeViewStateToSearch, DEFAULT_VIEW_STATE } from '@/lib/view-state'
import type { TaskFlat } from '@future/api-client/planner'

export type DrillPayload =
  | { field: 'progress'; value: TaskFlat['progress'] }
  | { field: 'priority'; value: TaskFlat['priority'] }
  | { field: 'bucket'; value: string }
  | { field: 'workload'; assigneeId: string; priority: TaskFlat['priority'] }

export function buildDrillThroughUrl(planId: string, payload: DrillPayload): string {
  // Always build from a fresh DEFAULT_VIEW_STATE with view forced to 'grid'
  // This implements "replace" semantics — no existing filters are preserved
  const base = { ...DEFAULT_VIEW_STATE, view: 'grid' as const }

  let filter = { ...base.filter }

  switch (payload.field) {
    case 'progress':
      // progress is not a ViewState filter yet — navigates to Grid without filtering
      break
    case 'priority':
      filter = { ...filter, priority: [payload.value] }
      break
    case 'bucket':
      filter = { ...filter, buckets: [payload.value] }
      break
    case 'workload':
      filter = { ...filter, assignees: [payload.assigneeId], priority: [payload.priority] }
      break
  }

  const state = { ...base, filter }
  const qs = serializeViewStateToSearch(state)
  return `/plans/${planId}/grid${qs ? '?' + qs : ''}`
}
