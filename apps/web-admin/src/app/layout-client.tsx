'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { AgentProvider } from '@future/agent'
import { trpc } from '../lib/trpc'
import { adminNavConfig } from '../navigation'

export function AdminLayoutClient({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AgentProvider>
        <AppLayout config={adminNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
          {children}
        </AppLayout>
      </AgentProvider>
    </QueryClientProvider>
  )
}
