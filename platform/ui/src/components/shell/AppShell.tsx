import type { ReactNode } from 'react'
import { useAgentPanel } from '../../hooks/useAgentPanel'
import { useSidebar } from '../../hooks/useSidebar'
import type { SetaUIMessage } from '../../lib/chunksToUIMessages'
import { cn } from '../../lib/cn'
import type { AgentContext, NavItem, Tenant } from '../../types'
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
