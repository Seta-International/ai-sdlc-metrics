import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from './index'

export type TRPCClientOptions = {
  apiUrl: string
  headers?: Record<string, string> | (() => Record<string, string>)
}

export function createTRPCClient(options: TRPCClientOptions) {
  const { apiUrl, headers } = options
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        headers: headers ?? {},
      }),
    ],
  })
}

export type TRPCClient = ReturnType<typeof createTRPCClient>
