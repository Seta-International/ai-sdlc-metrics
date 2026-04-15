'use client'

import type { ReactNode } from 'react'
import { cn, SidebarProvider, SidebarInset } from '@future/ui'
import { useOptionalAgentState, AgentPanel, AgentStrip } from '@future/agent'
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
  const agentState = useOptionalAgentState()
  const panelOpen = agentState?.panelOpen ?? false
  const togglePanel = agentState?.togglePanel ?? (() => {})

  return (
    <PermissionProvider trpc={trpc}>
      <SidebarProvider>
        <SidebarRenderer groups={config.sidebar} />
        <SidebarInset>
          <NavbarRenderer config={config.navbar} {...navbarProps} onAgentClick={togglePanel} />
          <AgentStrip />
          <div className="flex flex-1 overflow-hidden">
            <main className={cn('flex-1 overflow-auto', panelOpen && 'mr-[400px]')}>
              {children}
            </main>
            {panelOpen && <AgentPanel />}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  )
}
