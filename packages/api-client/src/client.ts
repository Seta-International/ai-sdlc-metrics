import { createTRPCClient as createVanillaTRPCClient, httpBatchLink } from '@trpc/client'
import type { TRPCClient as VanillaTRPCClient } from '@trpc/client'
import type { AnyTRPCRouter } from '@trpc/server'

export type TRPCClient<TRouter extends AnyTRPCRouter> = VanillaTRPCClient<TRouter>

export function createTRPCClient<TRouter extends AnyTRPCRouter>(
  apiUrl: string,
): TRPCClient<TRouter> {
  // httpBatchLink options are router-config-dependent in tRPC v11 types; cast is safe here
  return createVanillaTRPCClient<TRouter>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    links: [httpBatchLink({ url: `${apiUrl}/trpc` }) as any],
  })
}
