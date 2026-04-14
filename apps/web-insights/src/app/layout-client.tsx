'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { insightsNavConfig } from '../navigation'

export function InsightsLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={insightsNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
