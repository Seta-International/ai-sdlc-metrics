'use client'

import { useMemo } from 'react'
import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import type { TaskGroup } from '../task-group'
import { trpc } from '../trpc'
import { personalKeys } from '../query-keys'
import { applyTaskFilter } from '../task-filter'
import { sortTasks } from '../task-sort'
import { groupTasks } from '../task-group'
import { useViewState } from './useViewState'

export interface UsePersonalTasksInput {
  includeCompleted: boolean
}

export interface UsePersonalTasksResult {
  data: TaskFlatWithPlan[] | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
  processed: { rows: TaskFlatWithPlan[]; groups: TaskGroup[] } | undefined
}

/**
 * React Query wrapper around trpc.planner.personal.listTasks.
 * Applies the current view-state filter, sort, and groupBy on top of the
 * raw personal task list. Cache key is scoped to actorId + tenantId + includeCompleted
 * for RLS correctness.
 */
export function usePersonalTasks({
  includeCompleted,
}: UsePersonalTasksInput): UsePersonalTasksResult {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const query = useQuery({
    queryKey: personalKeys.listTasks(actorId, tenantId, includeCompleted),
    queryFn: () =>
      trpc.planner.personal.listTasks.query({
        actorId,
        tenantId,
        includeCompleted,
      }) as Promise<TaskFlatWithPlan[]>,
    enabled: Boolean(actorId && tenantId),
    staleTime: 5_000,
  })

  const { state } = useViewState({ scope: 'personal' })

  const processed = useMemo<{ rows: TaskFlatWithPlan[]; groups: TaskGroup[] } | undefined>(() => {
    if (!query.data) return undefined
    // applyTaskFilter / sortTasks are generic (T extends TaskFlat) — no cast needed
    const filtered = applyTaskFilter(query.data, state.filter, { includeCompleted })
    const sorted = state.sort ? sortTasks(filtered, state.sort) : filtered
    const groups = groupTasks(sorted, state.groupBy)
    return { rows: sorted, groups }
  }, [query.data, state.filter, state.sort, state.groupBy, includeCompleted])

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    processed,
  }
}
