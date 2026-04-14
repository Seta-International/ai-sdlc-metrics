'use client'

import type { ReactNode } from 'react'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { peopleNavConfig } from '../navigation'

export function PeopleLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={peopleNavConfig} trpc={trpc as unknown as PermissionTrpcClient}>
      {children}
    </AppLayout>
  )
}
