'use client'

import { useQuery } from '@future/api-client'
import { Skeleton, Badge } from '@future/ui'
import { AdminPageHeader } from '@/components/admin-page-header'
import { OrgContextSwitcher } from '@/components/system/org-context-switcher'
import { trpc } from '@/lib/trpc'
import { listPlatformTenantsQueryKey, type PlatformTenant } from '@/lib/admin-api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminPlatform = (trpc.admin as any).platform

interface OrgOverviewPageProps {
  params: { tenantId: string }
}

export default function OrgOverviewPage({ params }: OrgOverviewPageProps) {
  const { tenantId } = params

  const { data: allTenants, isLoading } = useQuery({
    queryKey: listPlatformTenantsQueryKey,
    queryFn: () => adminPlatform.listTenants.query({}) as Promise<PlatformTenant[]>,
  })

  const tenant = (allTenants as PlatformTenant[] | undefined)?.find((t) => t.id === tenantId)

  return (
    <main className="p-8">
      {tenant && (
        <div className="mb-4">
          <OrgContextSwitcher activeOrgName={tenant.name} activeOrgSlug={tenant.slug} />
        </div>
      )}

      <AdminPageHeader title="Organization Overview" />

      <div className="mt-6">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        )}

        {!isLoading && tenant && (
          <div className="space-y-4">
            <div>
              <h2 className="text-h3">{tenant.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">/{tenant.slug}</p>
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </dt>
                <dd className="mt-1">
                  <Badge
                    variant={
                      tenant.status === 'active'
                        ? 'success'
                        : tenant.status === 'suspended'
                          ? 'destructive'
                          : 'subtle'
                    }
                  >
                    {tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)}
                  </Badge>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Plan
                </dt>
                <dd className="mt-1 text-sm">
                  {tenant.planTier.charAt(0).toUpperCase() + tenant.planTier.slice(1)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Created
                </dt>
                <dd className="mt-1 text-sm">{new Date(tenant.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        )}

        {!isLoading && !tenant && <p className="text-muted-foreground">Tenant not found.</p>}
      </div>
    </main>
  )
}
