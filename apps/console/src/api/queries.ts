import { queryOptions } from '@tanstack/react-query'
import { client } from './client'

export const qk = {
  connectors: (tenantId: string) => ['connectors', tenantId] as const,
}

export const connectorsQueryOptions = (tenantId: string) =>
  queryOptions({
    queryKey: qk.connectors(tenantId),
    queryFn: ({ signal }) => client.listConnectors(tenantId, { signal }),
    staleTime: 30_000,
  })

export const grantConsentMutation = {
  mutationKey: ['connectors', 'consent-url'] as const,
  mutationFn: (args: { tenantId: string; connectorId: string; tenantHint?: string }) =>
    client.grantConsentUrl(args),
}
