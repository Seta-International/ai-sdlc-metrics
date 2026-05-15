import { TenantsPage } from '@seta/identity-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { tenantsQueryOptions } from '../../api/queries'

export const Route = createFileRoute('/_authed/tenants')({
  loader: ({ context }) => context.queryClient.ensureQueryData(tenantsQueryOptions),
  component: TenantsRoute,
})

function TenantsRoute() {
  const { data: tenants } = useSuspenseQuery(tenantsQueryOptions)
  return (
    <TenantsPage
      tenants={tenants}
      renderTenantLink={(t) => (
        <Link
          to="/tenants/$id/connectors"
          params={{ id: t.id }}
          className="text-primary hover:underline"
        >
          {t.name}
        </Link>
      )}
    />
  )
}
