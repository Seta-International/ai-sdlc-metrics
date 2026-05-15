import { ConsentLandingPage } from '@seta/identity-client'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { z } from 'zod'
import { qk } from '../../api/queries'

const ConsentSearch = z.object({
  ok: z.enum(['0', '1']).optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/_authed/tenants/$id/connectors/$cid/consent')({
  validateSearch: ConsentSearch,
  component: ConsentLandingRoute,
})

function ConsentLandingRoute() {
  const { id: tenantId, cid: connectorId } = Route.useParams()
  const search = Route.useSearch()
  const queryClient = useQueryClient()
  const ok = search.ok === '1'

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: qk.connectors(tenantId) })
  }, [queryClient, tenantId])

  return (
    <ConsentLandingPage
      tenantId={tenantId}
      connectorId={connectorId}
      ok={ok}
      {...(search.error !== undefined ? { error: search.error } : {})}
      renderBackLink={({ tenantId }) => (
        <Link
          to="/tenants/$id/connectors"
          params={{ id: tenantId }}
          className="text-primary hover:underline"
        >
          Back to connectors
        </Link>
      )}
    />
  )
}
