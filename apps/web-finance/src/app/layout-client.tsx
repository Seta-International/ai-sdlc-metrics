'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { financeNavConfig } from '../navigation'

export function FinanceLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={financeNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
