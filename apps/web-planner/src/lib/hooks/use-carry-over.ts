'use client'

import { useMutation, useQuery, useQueryClient } from '@future/api-client'
import type { UseMutationResult, UseQueryResult } from '@future/api-client'
import { useSession } from '@future/auth'
import type { MyDayTask } from '@future/api-client/planner'
import { trpc } from '../trpc'
import { myDayQueryKey } from './use-my-day'

export interface CarryOverVars {
  fromDate: string
  toDate: string
  taskIds: string[]
}

export function carryOverCandidatesQueryKey(actorId: string, tenantId: string, date: string) {
  return ['personal.myDay.carryOverCandidates', actorId, tenantId, date] as const
}

/**
 * React Query wrapper over `trpc.planner.personal.myDay.getCarryOverCandidates`.
 *
 * Returns the actor's carry-over candidates (tasks that were on yesterday's
 * My Day and remain unfinished) for display in the carry-over banner above
 * the current `date`'s My Day views. Cached 5 minutes; a successful
 * `useCarryOver` invalidates this key alongside `myDayQueryKey`.
 */
export function useMyDayCarryOverCandidates(date: string): UseQueryResult<MyDayTask[]> {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  return useQuery<MyDayTask[]>({
    queryKey: carryOverCandidatesQueryKey(actorId, tenantId, date),
    queryFn: () =>
      trpc.planner.personal.myDay.getCarryOverCandidates.query({
        actorId,
        tenantId,
        date,
      }) as Promise<MyDayTask[]>,
    enabled: Boolean(actorId && tenantId && date),
    staleTime: 5 * 60_000,
  })
}

/**
 * React Query wrapper over `trpc.planner.personal.myDay.carryOver`.
 *
 * On success, invalidates both the destination day's My Day cache AND the
 * carry-over candidate caches for the source (fromDate) and destination
 * (toDate) so the banner and list stay consistent after the write.
 */
export function useCarryOver(): UseMutationResult<{ carriedCount: number }, Error, CarryOverVars> {
  const queryClient = useQueryClient()
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  return useMutation<{ carriedCount: number }, Error, CarryOverVars>({
    mutationFn: (vars) =>
      trpc.planner.personal.myDay.carryOver.mutate({
        actorId,
        tenantId,
        fromDate: vars.fromDate,
        toDate: vars.toDate,
        taskIds: vars.taskIds,
      }) as Promise<{ carriedCount: number }>,

    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: myDayQueryKey(actorId, tenantId, vars.toDate),
      })
      queryClient.invalidateQueries({
        queryKey: carryOverCandidatesQueryKey(actorId, tenantId, vars.toDate),
      })
      queryClient.invalidateQueries({
        queryKey: carryOverCandidatesQueryKey(actorId, tenantId, vars.fromDate),
      })
    },
  })
}
