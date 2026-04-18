'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { AgentProvider } from '@future/agent'
import { trpc } from '../lib/trpc'
import { plannerNavConfig } from '../navigation'

export function PlannerLayoutClient({ children }: { children: ReactNode }) {
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
        <AppLayout config={plannerNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
          {children}
        </AppLayout>
      </AgentProvider>
    </QueryClientProvider>
  )
}
