'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { plannerNavConfig } from '../navigation'

export function PlannerLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={plannerNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
