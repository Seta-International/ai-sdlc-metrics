'use client'

import { useQuery, useMutation, useQueryClient } from '@future/api-client'
import { Alert, AlertDescription } from '@future/ui'
import { OrganizationTable } from '@/components/system/organization-table'
import { AdminPageHeader } from '@/components/admin-page-header'
import {
  listPlatformTenants,
  listPlatformTenantsQueryKey,
  listTenantSyncHealth,
  tenantSyncHealthQueryKey,
  updateTenantStatus,
  type TenantStatus,
} from '@/lib/admin-api'
import type { TenantRow } from '@/components/system/organization-table'

export default function PlatformAdminsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: listPlatformTenantsQueryKey,
    queryFn: () => listPlatformTenants() as Promise<TenantRow[]>,
  })

  const { data: syncHealthData } = useQuery({
    queryKey: tenantSyncHealthQueryKey,
    queryFn: () => listTenantSyncHealth(),
  })

  const updateStatus = useMutation({
    mutationFn: (input: { tenantId: string; status: TenantStatus }) => updateTenantStatus(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listPlatformTenantsQueryKey })
    },
  })

  const rawTenants = (data as TenantRow[] | undefined) ?? []

  const syncHealthByTenantId = new Map((syncHealthData ?? []).map((row) => [row.tenantId, row]))

  const tenants: TenantRow[] = rawTenants.map((t) => {
    const health = syncHealthByTenantId.get(t.id)
    return {
      ...t,
      msSyncStatus: health?.status ?? null,
      msSyncOpenConflicts: health?.openConflicts ?? null,
    }
  })

  return (
    <main className="p-8">
      <AdminPageHeader
        title="Platform Organizations"
        description="Manage all tenants on this platform."
      />
      <div className="mt-6">
        {isError && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load organizations. Please try again.</AlertDescription>
          </Alert>
        )}
        <OrganizationTable
          tenants={tenants}
          isLoading={isLoading}
          onUpdateStatus={(tenantId, status) => updateStatus.mutate({ tenantId, status })}
          isUpdatingStatus={updateStatus.isPending}
        />
      </div>
    </main>
  )
}
