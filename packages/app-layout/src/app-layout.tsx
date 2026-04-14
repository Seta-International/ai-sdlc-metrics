'use client'

import type { ReactNode } from 'react'
import { SidebarProvider, SidebarInset } from '@future/ui'
import { PermissionProvider, type PermissionTrpcClient } from './permission-provider'
import { NavbarRenderer, type NavbarRendererProps } from './navbar/navbar-renderer'
import { SidebarRenderer } from './sidebar/sidebar-renderer'
import type { NavigationConfig } from './types'

export interface AppLayoutProps extends Omit<NavbarRendererProps, 'config'> {
  config: NavigationConfig
  trpc: PermissionTrpcClient
  children: ReactNode
}

export function AppLayout({ config, trpc, children, ...navbarProps }: AppLayoutProps) {
  return (
    <PermissionProvider trpc={trpc}>
      <SidebarProvider>
        <SidebarRenderer groups={config.sidebar} />
        <SidebarInset>
          <NavbarRenderer config={config.navbar} {...navbarProps} />
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  )
}
