import { createTRPCClient } from '@future/api-client'

export const trpc = createTRPCClient({
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  headers: () => ({
    'x-future-tenant-id': process.env.NEXT_PUBLIC_DEV_TENANT_ID ?? '',
    'x-future-actor-id': process.env.NEXT_PUBLIC_DEV_ACTOR_ID ?? '',
  }),
})
