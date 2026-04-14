'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { adminNavConfig } from '../navigation'

export function AdminLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={adminNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
