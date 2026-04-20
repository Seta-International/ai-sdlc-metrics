'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'

const DEFAULT_TENANT_TIMEZONE = 'Asia/Ho_Chi_Minh'

export interface TenantTimezoneResult {
  timezone: string
  isLoading: boolean
}

export function useTenantTimezone(): TenantTimezoneResult {
  const session = useSession()

  const { data, isLoading } = useQuery({
    queryKey: ['admin.getTenantTimezone', session?.tenantId],
    queryFn: () =>
      trpc.admin.getTenantTimezone.query({}).then((r) => r as unknown as { timezone: string }),
    enabled: !!session,
    staleTime: 1000 * 60 * 60, // 1h — timezone rarely changes
  })

  return {
    timezone: data?.timezone ?? DEFAULT_TENANT_TIMEZONE,
    isLoading,
  }
}
