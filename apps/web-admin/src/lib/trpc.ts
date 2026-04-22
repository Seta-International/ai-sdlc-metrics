import { createTRPCClient, type TRPCClient } from '@future/api-client'

export const trpc: TRPCClient = createTRPCClient({
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
})
