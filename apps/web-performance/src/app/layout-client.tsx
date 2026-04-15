'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { AgentProvider } from '@future/agent'
import { trpc } from '../lib/trpc'
import { performanceNavConfig } from '../navigation'

export function PerformanceLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AgentProvider>
      <AppLayout config={performanceNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
        {children}
      </AppLayout>
    </AgentProvider>
  )
}
