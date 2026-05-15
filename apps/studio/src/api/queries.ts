import { queryOptions } from '@tanstack/react-query'
import { client } from './client'

export const qk = {
  me: () => ['me'] as const,
  tenants: () => ['tenants'] as const,
  tenant: (id: string) => ['tenant', id] as const,
  connectors: (tenantId: string) => ['connectors', tenantId] as const,
}

export const meQueryOptions = queryOptions({
  queryKey: qk.me(),
  queryFn: ({ signal }) => client.getMe({ signal }),
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
})

export const tenantsQueryOptions = queryOptions({
  queryKey: qk.tenants(),
  queryFn: ({ signal }) => client.listTenants({ signal }),
  staleTime: 60_000,
})

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
