'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { peopleNavConfig } from '../navigation'

export function PeopleLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={peopleNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
