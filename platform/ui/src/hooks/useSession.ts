import type { Me } from '@seta/agent-sdk'
import { useQuery } from '@tanstack/react-query'
import { useAgentClient } from '../provider/useAgentClient'

export function useSession() {
  const client = useAgentClient()
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: ({ signal }) => client.getMe({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
}
