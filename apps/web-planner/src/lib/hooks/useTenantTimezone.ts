'use client'

import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'
import { adminKeys } from '../query-keys'

const DEFAULT_TENANT_TIMEZONE = 'Asia/Ho_Chi_Minh'

// AppRouter types the `admin` slot as `any` (app-router.ts `_adminRouter: any`),
// so the tRPC proxy cannot infer procedure signatures under `trpc.admin`.
// Narrow it here to the single procedure this hook calls — same pattern used by
// apps/web-admin/src/app/settings/page.tsx.
interface AdminTrpcSlice {
  getTenantTimezone: { query: (input: Record<string, never>) => Promise<{ timezone: string }> }
}

export interface TenantTimezoneResult {
  timezone: string
  isLoading: boolean
}

export function useTenantTimezone(): TenantTimezoneResult {
  const session = useSession()

  const { data, isLoading } = useQuery({
    queryKey: adminKeys.tenantTimezone(session?.tenantId),
    queryFn: () => (trpc.admin as unknown as AdminTrpcSlice).getTenantTimezone.query({}),
    enabled: !!session,
    staleTime: 1000 * 60 * 60, // 1h — timezone rarely changes
  })

  return {
    timezone: data?.timezone ?? DEFAULT_TENANT_TIMEZONE,
    isLoading,
  }
}
