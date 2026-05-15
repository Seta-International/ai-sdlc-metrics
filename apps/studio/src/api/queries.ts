import { queryOptions } from '@tanstack/react-query'
import { client } from './client'

export const qk = {
  me: () => ['me'] as const,
  tenants: () => ['tenants'] as const,
  tenant: (id: string) => ['tenant', id] as const,
}

export const meQueryOptions = queryOptions({
  queryKey: qk.me(),
  queryFn: ({ signal }) => client.getMe({ signal }),
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
})
