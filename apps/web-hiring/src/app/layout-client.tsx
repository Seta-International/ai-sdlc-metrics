'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { hiringNavConfig } from '../navigation'

export function HiringLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={hiringNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
