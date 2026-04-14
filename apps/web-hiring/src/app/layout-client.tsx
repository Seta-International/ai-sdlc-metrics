'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { hiringNavConfig } from '../navigation'

export function HiringLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={hiringNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
