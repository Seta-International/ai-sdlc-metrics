// TYPE ONLY — no runtime server code imported here.
// AppRouter is defined in apps/api and re-exported as a type.
// Import like: import type { AppRouter } from '@future/api-client'
export type { AppRouter } from '@future/api/trpc'

export { createTRPCClient } from './client'
export type { TRPCClient } from './client'

// @tanstack/react-query re-exports — consumers must import from @future/api-client, not directly
export {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  useSuspenseQuery,
  keepPreviousData,
  useIsMutating,
  useIsFetching,
} from '@tanstack/react-query'
export type {
  UseQueryResult,
  UseMutationResult,
  UseInfiniteQueryResult,
  QueryKey,
  QueryOptions,
  MutationOptions,
  InfiniteData,
} from '@tanstack/react-query'
