import { createTRPCProxyClient, httpLink } from '@trpc/client'
import type { AppRouter } from './index'

export type TRPCClientOptions = {
  apiUrl: string
  headers?: Record<string, string> | (() => Record<string, string>)
}

/**
 * Wraps fetch so the browser includes the `_future_session` cookie on
 * cross-origin requests from a zone (e.g. localhost:3002) to the API
 * (localhost:3001). Without `credentials: 'include'`, fetch defaults to
 * `same-origin` and the auth middleware on the API never sees the cookie.
 */
const credentialedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, credentials: 'include' })

export function createTRPCClient(options: TRPCClientOptions) {
  const { apiUrl, headers } = options
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpLink({
        url: `${apiUrl}/trpc`,
        headers: headers ?? {},
        fetch: credentialedFetch,
      }),
    ],
  })
}

export type TRPCClient = ReturnType<typeof createTRPCClient>
