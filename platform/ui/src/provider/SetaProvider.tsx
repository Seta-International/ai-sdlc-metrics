import type { AgentClient } from '@seta/agent-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { AgentClientContext } from './AgentClientContext'

interface Props {
  client: AgentClient
  queryClient?: QueryClient
  children: ReactNode
}

export function SetaProvider({ client, queryClient, children }: Props) {
  const qc = useMemo(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
    [queryClient],
  )
  return (
    <AgentClientContext value={client}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AgentClientContext>
  )
}
