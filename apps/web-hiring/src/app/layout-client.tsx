'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { AgentProvider } from '@future/agent'
import { trpc } from '../lib/trpc'
import { hiringNavConfig } from '../navigation'

export function HiringLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AgentProvider>
      <AppLayout config={hiringNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
        {children}
      </AppLayout>
    </AgentProvider>
  )
}
