import { TenantsPage } from '@seta/portal'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { meQueryOptions } from '../../api/queries'

export const Route = createFileRoute('/_authed/tenants')({
  component: TenantsRoute,
})

function TenantsRoute() {
  const { data: me } = useSuspenseQuery(meQueryOptions)
  return (
    <TenantsPage
      tenants={me?.tenants ?? []}
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
