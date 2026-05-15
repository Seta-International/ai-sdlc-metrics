import type { ReactNode } from 'react'
import { useAgentPanel } from '../../hooks/useAgentPanel'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useSidebar } from '../../hooks/useSidebar'
import type { SetaUIMessage } from '../../lib/chunksToUIMessages'
import { cn } from '../../lib/cn'
import type { AgentContext, NavItem, Tenant } from '../../types'
import { Dialog } from '../feedback/Dialog'
import { AgentPanel } from './AgentPanel'
import { AppSwitcher, type AppTile } from './AppSwitcher'
import type { Crumb } from './Breadcrumb'
import { Sidebar } from './Sidebar'
import { TenantSwitcher } from './TenantSwitcher'
import { TopBar } from './TopBar'

interface Props {
  nav: readonly NavItem[]
  currentPath: string
  breadcrumb?: readonly Crumb[]
  agentContext: AgentContext
  tenants: readonly Tenant[]
  currentTenantId: string
  onTenantSelect: (id: string) => void
  appTiles: readonly AppTile[]
  activeAppId: string
  agentMessages: readonly SetaUIMessage[]
  agentStreaming?: boolean
  agentPending?: boolean
  onAgentSubmit: (text: string, context: AgentContext) => void
  notificationCount?: number
  userMenu?: ReactNode
  logo?: ReactNode
  children: ReactNode
}

export function AppShell(props: Props) {
  const sidebar = useSidebar()
  const panel = useAgentPanel()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  if (!isDesktop) {
    return (
      <div className="flex h-screen flex-col bg-canvas">
        <TopBar
          {...(props.breadcrumb !== undefined ? { breadcrumb: props.breadcrumb } : {})}
          agentPanelOpen={panel.open}
          onAgentToggle={panel.toggle}
          onSearch={() => sidebar.toggle()}
          {...(props.notificationCount !== undefined
            ? { notificationCount: props.notificationCount }
            : {})}
          {...(props.userMenu !== undefined ? { userMenu: props.userMenu } : {})}
        />
        <main className="flex-1 overflow-y-auto p-4">{props.children}</main>

        <Dialog.Root open={!sidebar.collapsed} onOpenChange={(o) => sidebar.set(!o)}>
          <Dialog.Content className="!left-0 !top-0 !right-auto !translate-x-0 !translate-y-0 h-full w-64 max-w-[85vw] rounded-none p-0">
            <Sidebar
              nav={props.nav}
              currentPath={props.currentPath}
              collapsed={false}
              onToggleCollapse={() => sidebar.set(true)}
              {...(props.logo !== undefined ? { logo: props.logo } : {})}
              tenantSwitcher={
                <TenantSwitcher
                  tenants={props.tenants}
                  currentId={props.currentTenantId}
                  onSelect={props.onTenantSelect}
                  collapsed={false}
                />
              }
              appSwitcher={
                <AppSwitcher
                  tiles={props.appTiles}
                  activeId={props.activeAppId}
                  collapsed={false}
                />
              }
              {...(props.userMenu !== undefined ? { userMenu: props.userMenu } : {})}
            />
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={panel.open} onOpenChange={panel.set}>
          <Dialog.Content className="!right-0 !left-auto !top-0 !translate-x-0 !translate-y-0 h-full w-[85vw] max-w-[360px] rounded-none p-0">
            <AgentPanel
              agentContext={props.agentContext}
              messages={props.agentMessages}
              {...(props.agentStreaming !== undefined ? { streaming: props.agentStreaming } : {})}
              {...(props.agentPending !== undefined ? { pending: props.agentPending } : {})}
              onClose={() => panel.set(false)}
              onSubmit={props.onAgentSubmit}
            />
          </Dialog.Content>
        </Dialog.Root>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        nav={props.nav}
        currentPath={props.currentPath}
        collapsed={sidebar.collapsed}
        onToggleCollapse={sidebar.toggle}
        {...(props.logo !== undefined ? { logo: props.logo } : {})}
        tenantSwitcher={
          <TenantSwitcher
            tenants={props.tenants}
            currentId={props.currentTenantId}
            onSelect={props.onTenantSelect}
            collapsed={sidebar.collapsed}
          />
        }
        appSwitcher={
          <AppSwitcher
            tiles={props.appTiles}
            activeId={props.activeAppId}
            collapsed={sidebar.collapsed}
          />
        }
        {...(props.userMenu !== undefined ? { userMenu: props.userMenu } : {})}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          {...(props.breadcrumb !== undefined ? { breadcrumb: props.breadcrumb } : {})}
          agentPanelOpen={panel.open}
          onAgentToggle={panel.toggle}
          {...(props.notificationCount !== undefined
            ? { notificationCount: props.notificationCount }
            : {})}
          {...(props.userMenu !== undefined ? { userMenu: props.userMenu } : {})}
        />
        <main className="flex-1 overflow-y-auto p-6">{props.children}</main>
      </div>
      <div
        className={cn('shrink-0 transition-[width] duration-200', panel.open ? 'w-[360px]' : 'w-0')}
      >
        {panel.open && (
          <AgentPanel
            agentContext={props.agentContext}
            messages={props.agentMessages}
            {...(props.agentStreaming !== undefined ? { streaming: props.agentStreaming } : {})}
            {...(props.agentPending !== undefined ? { pending: props.agentPending } : {})}
            onClose={() => panel.set(false)}
            onSubmit={props.onAgentSubmit}
          />
        )}
      </div>
    </div>
  )
}
