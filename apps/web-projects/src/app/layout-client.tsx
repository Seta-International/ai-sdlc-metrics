'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { projectsNavConfig } from '../navigation'

export function ProjectsLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={projectsNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
