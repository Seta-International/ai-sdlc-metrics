import { useMe } from '@seta/identity-client'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { z } from 'zod'
import { qk } from '../../api/queries'
import { ConsentLandingPage } from '../../pages/ConsentLandingPage'

const ConsentSearch = z.object({
  ok: z.enum(['0', '1']).optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/_authed/connectors/$cid/consent')({
  validateSearch: ConsentSearch,
  component: ConsentLandingRoute,
})

function ConsentLandingRoute() {
  const { cid: connectorId } = Route.useParams()
  const { data: me } = useMe()
  const tenantId = me?.tenant?.id ?? ''
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
      renderBackLink={() => (
        <Link to="/connectors" className="text-primary hover:underline">
          Back to connectors
        </Link>
      )}
    />
  )
}
