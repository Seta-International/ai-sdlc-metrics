'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { AgentProvider } from '@future/agent'
import { trpc } from '../lib/trpc'
import { goalsNavConfig } from '../navigation'

export function GoalsLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AgentProvider>
      <AppLayout config={goalsNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
        {children}
      </AppLayout>
    </AgentProvider>
  )
}
