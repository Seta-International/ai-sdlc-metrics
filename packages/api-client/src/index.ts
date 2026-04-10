// TYPE ONLY — no runtime server code imported here.
// AppRouter is defined in apps/api and re-exported as a type.
// Import like: import type { AppRouter } from '@future/api-client'
export type { AppRouter } from '@future/api/trpc'

export { createTRPCClient } from './client'
export type { TRPCClient } from './client'
