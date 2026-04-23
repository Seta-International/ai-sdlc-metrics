'use client'

import * as React from 'react'
import type { ReactNode } from 'react'
import {
  SidebarProvider,
  SidebarInset,
  AppLauncher,
  FUTURE_APPS,
  LOCAL_FUTURE_APPS,
} from '@future/ui'
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
  const [launcherOpen, setLauncherOpen] = React.useState(false)
  const apps = process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true' ? LOCAL_FUTURE_APPS : FUTURE_APPS

  return (
    <PermissionProvider trpc={trpc}>
      <AppLauncher open={launcherOpen} onOpenChange={setLauncherOpen} apps={apps} />
      <SidebarProvider className="h-svh">
        <SidebarRenderer
          groups={config.sidebar}
          zoneTitle={config.navbar.title}
          zoneIcon={config.navbar.icon}
          userMenuSlot={<SessionUserMenu />}
          onSearchClick={navbarProps.onSearchClick}
          onAppLauncherClick={() => setLauncherOpen(true)}
        />
        <SidebarInset className="overflow-hidden">
          <NavbarRenderer
            config={config.navbar}
            {...navbarProps}
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
