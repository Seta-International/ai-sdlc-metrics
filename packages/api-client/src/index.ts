// TYPE ONLY — no runtime server code imported here.
// AppRouter is defined in apps/api and re-exported as a type.
// Import like: import type { AppRouter } from '@future/api-client'
export type { AppRouter } from '../../apps/api/src/common/trpc/app-router.js'

export { createTRPCClient } from './client.js'
export type { TRPCClient } from './client.js'
