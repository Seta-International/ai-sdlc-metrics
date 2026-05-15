import type { ConnectorSummary } from '@seta/agent-sdk'
import { ConnectorsPage } from '@seta/portal'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { client } from '../../api/client'
import { connectorsQueryOptions } from '../../api/queries'

export const Route = createFileRoute('/_authed/tenants/$id/connectors')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(connectorsQueryOptions(params.id)),
  component: ConnectorsRoute,
})

function ConnectorsRoute() {
  const { id: tenantId } = Route.useParams()
  const { data } = useSuspenseQuery(connectorsQueryOptions(tenantId))

  async function handleGrantConsent(connector: ConnectorSummary) {
    const { url } = await client.grantConsentUrl({
      tenantId,
      connectorId: connector.id,
    })
    window.location.href = url
  }

  return <ConnectorsPage connectors={data} onGrantConsent={handleGrantConsent} />
}
