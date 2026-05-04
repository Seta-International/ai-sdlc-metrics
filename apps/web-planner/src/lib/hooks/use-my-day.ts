'use client'

import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import type { MyDayTask } from '@future/api-client/planner'
import { trpc } from '../trpc'
import { personalKeys } from '../query-keys'

/**
 * React Query wrapper over `trpc.planner.personal.myDay.get`.
 *
 * Callers are expected to pass a tenant-local `YYYY-MM-DD` date string (typically
 * computed from `useTenantTimezone()`). The cache key is actor + tenant + date so
 * switching the displayed day triggers a fresh fetch.
 */
export function useMyDay(date: string) {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  return useQuery<MyDayTask[]>({
    queryKey: personalKeys.myDay(actorId, tenantId, date),
    queryFn: () =>
      trpc.planner.personal.myDay.get.query({
        actorId,
        tenantId,
        date,
      }) as Promise<MyDayTask[]>,
    enabled: Boolean(actorId && tenantId && date),
    staleTime: 30_000,
  })
}
