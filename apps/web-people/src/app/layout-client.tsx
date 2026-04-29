'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { AgentProvider } from '@future/agent'
import { Toaster } from '@future/ui'
import { trpc } from '../lib/trpc'
import { peopleNavConfig } from '../navigation'

export function PeopleLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AgentProvider>
      <AppLayout config={peopleNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
        {children}
      </AppLayout>
      <Toaster position="bottom-right" />
    </AgentProvider>
  )
}
