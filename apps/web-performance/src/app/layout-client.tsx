'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { performanceNavConfig } from '../navigation'

export function PerformanceLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={performanceNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
