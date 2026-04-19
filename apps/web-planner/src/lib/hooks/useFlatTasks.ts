'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'
import { applyTaskFilter } from '../task-filter'
import { sortTasks } from '../task-sort'
import { groupTasks } from '../task-group'
import { useViewState } from './useViewState'
import type { TaskFlat } from '../task-types'
import type { TaskGroup } from '../task-group'

export interface FlatTasksProcessed {
  rows: TaskFlat[]
  groups: TaskGroup[]
}

export interface UseFlatTasksResult {
  data: TaskFlat[] | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
  processed: FlatTasksProcessed | undefined
}

/**
 * React Query wrapper around trpc.planner.tasks.getFlat.
 * Applies the current view-state filter, sort, and groupBy on top of the
 * raw flat task list. Cache key is scoped to planId + actorId + tenantId
 * for RLS correctness.
 */
export function useFlatTasks({ planId }: { planId: string }): UseFlatTasksResult {
  const session = useSession()

  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const query = useQuery({
    queryKey: ['tasks.getFlat', planId, actorId, tenantId] as const,
    queryFn: () =>
      trpc.planner.tasks.getFlat.query({ planId, actorId, tenantId }) as Promise<TaskFlat[]>,
    enabled: Boolean(planId && actorId && tenantId),
    staleTime: 5_000,
  })

  const { state } = useViewState({ planId })

  const processed = useMemo<FlatTasksProcessed | undefined>(() => {
    if (!query.data) return undefined
    const filtered = applyTaskFilter(query.data, state.filter)
    const sorted = state.sort ? sortTasks(filtered, state.sort) : filtered
    return { rows: sorted, groups: groupTasks(sorted, state.groupBy) }
  }, [query.data, state.filter, state.sort, state.groupBy])

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    processed,
  }
}
