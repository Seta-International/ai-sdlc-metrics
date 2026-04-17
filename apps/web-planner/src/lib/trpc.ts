import { createTRPCClient } from '@future/api-client'

export const trpc = createTRPCClient({
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
})
