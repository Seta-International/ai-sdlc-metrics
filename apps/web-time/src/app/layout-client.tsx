'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { timeNavConfig } from '../navigation'

export function TimeLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={timeNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
