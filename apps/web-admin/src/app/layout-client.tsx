'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { adminNavConfig } from '../navigation'

export function AdminLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={adminNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
