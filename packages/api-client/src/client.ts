import { createTRPCClient as createVanillaTRPCClient, httpBatchLink } from '@trpc/client'
import type { TRPCClient as VanillaTRPCClient } from '@trpc/client'
import type { AppRouter } from './index'

export type TRPCClient = VanillaTRPCClient<AppRouter>

export function createTRPCClient(apiUrl: string): TRPCClient {
  return createVanillaTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${apiUrl}/trpc` })],
  })
}
