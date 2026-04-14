'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { agentsNavConfig } from '../navigation'

export function AgentsLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={agentsNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
