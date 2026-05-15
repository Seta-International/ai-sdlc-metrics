import { queryOptions, useQuery } from '@tanstack/react-query'
import { MeResponseSchema } from './types'

export const meQueryOptions = queryOptions({
  queryKey: ['me'] as const,
  queryFn: async () => {
    const res = await fetch('/me', { credentials: 'include' })
    if (!res.ok) throw new Error(`me ${res.status}`)
    return MeResponseSchema.parse(await res.json())
  },
  staleTime: 60_000,
})

export function useMe() {
  return useQuery(meQueryOptions)
}
