import type { ConnectorSummary } from '@seta/agent-sdk'
import { meQueryOptions, useMe } from '@seta/identity-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { client } from '../../api/client'
import { connectorsQueryOptions } from '../../api/queries'
import { ConnectorsPage } from '../../pages/ConnectorsPage'

export const Route = createFileRoute('/_authed/connectors')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!me.tenant?.isAdmin) throw redirect({ to: '/' })
  },
  component: ConnectorsRoute,
})

function ConnectorsRoute() {
  const { data: me } = useMe()
  const tenantId = me?.tenant?.id ?? ''
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
