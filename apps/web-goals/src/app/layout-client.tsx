'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { goalsNavConfig } from '../navigation'

export function GoalsLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={goalsNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
