'use client'

import type { ReactNode } from 'react'
import { SidebarProvider, SidebarInset } from '@future/ui'
import { useOptionalAgentState, AgentPanel, AgentStrip } from '@future/agent'
import { PermissionProvider, type PermissionTrpcClient } from './permission-provider'
import { NavbarRenderer, type NavbarRendererProps } from './navbar/navbar-renderer'
import { SidebarRenderer } from './sidebar/sidebar-renderer'
import { SessionUserMenu } from './session-user-menu'
import { StubNotificationsPopover } from './stub-notifications-popover'
import type { NavigationConfig } from './types'

export interface AppLayoutProps extends Omit<
  NavbarRendererProps,
  'config' | 'userMenuSlot' | 'notificationsSlot'
> {
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
      <SidebarProvider className="h-svh">
        <SidebarRenderer groups={config.sidebar} />
        <SidebarInset className="overflow-hidden">
          <NavbarRenderer
            config={config.navbar}
            {...navbarProps}
            userMenuSlot={<SessionUserMenu />}
            notificationsSlot={<StubNotificationsPopover />}
            onAgentClick={togglePanel}
            agentPanelOpen={panelOpen}
          />
          <AgentStrip />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <main className="min-w-0 flex-1 overflow-auto">{children}</main>
            <div
              className="flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
              style={{ width: panelOpen ? 400 : 0 }}
            >
              <AgentPanel />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  )
}
