import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from './index'

export function createTRPCClient(apiUrl: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({ url: `${apiUrl}/trpc` })],
  })
}

export type TRPCClient = ReturnType<typeof createTRPCClient>
