'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { financeNavConfig } from '../navigation'

export function FinanceLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={financeNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
