'use client'

import { useQuery, useMutation, useQueryClient } from '@future/api-client'
import { OrganizationTable } from '@/components/system/organization-table'
import { AdminPageHeader } from '@/components/admin-page-header'
import {
  listPlatformTenants,
  listPlatformTenantsQueryKey,
  updateTenantStatus,
  type TenantStatus,
} from '@/lib/admin-api'
import type { TenantRow } from '@/components/system/organization-table'

export default function PlatformAdminsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: listPlatformTenantsQueryKey,
    queryFn: () => listPlatformTenants() as Promise<TenantRow[]>,
  })

  const updateStatus = useMutation({
    mutationFn: (input: { tenantId: string; status: TenantStatus }) => updateTenantStatus(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listPlatformTenantsQueryKey })
    },
  })

  const tenants = (data as TenantRow[] | undefined) ?? []

  return (
    <main className="p-8">
      <AdminPageHeader
        title="Platform Organizations"
        description="Manage all tenants on this platform."
      />
      <div className="mt-6">
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
