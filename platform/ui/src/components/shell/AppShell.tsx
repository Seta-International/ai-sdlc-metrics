import type { ReactNode } from 'react'
import { useAgentPanel } from '../../hooks/useAgentPanel'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useSidebar } from '../../hooks/useSidebar'
import type { SetaUIMessage } from '../../lib/chunksToUIMessages'
import { cn } from '../../lib/cn'
import type { AgentContext, NavItem, Tenant } from '../../types'
import { Dialog } from '../feedback/Dialog'
import { TooltipProvider } from '../feedback/Tooltip'
import { AgentPanel } from './AgentPanel'
import { AppSwitcher, type AppTile } from './AppSwitcher'
import type { Crumb } from './Breadcrumb'
import { Sidebar } from './Sidebar'
import { TenantSwitcher } from './TenantSwitcher'
import { TopBar } from './TopBar'

interface TenantSwitcherBundle {
  tenants: readonly Tenant[]
  currentTenantId: string
  onTenantSelect: (id: string) => void
}

interface AppSwitcherBundle {
  appTiles: readonly AppTile[]
  activeAppId: string
}

interface AgentPanelBundle {
  agentContext: AgentContext
  agentMessages: readonly SetaUIMessage[]
  onAgentSubmit: (text: string, context: AgentContext) => void
  agentStreaming?: boolean
  agentPending?: boolean
}

interface Props
  extends Partial<TenantSwitcherBundle>,
    Partial<AppSwitcherBundle>,
    Partial<AgentPanelBundle> {
  nav: readonly NavItem[]
  currentPath: string
  breadcrumb?: readonly Crumb[]
  notificationCount?: number
  userMenu?: ReactNode
  logo?: ReactNode
  children: ReactNode
}

function pickTenantSwitcher(p: Props): TenantSwitcherBundle | null {
  if (
    p.tenants !== undefined &&
    p.currentTenantId !== undefined &&
    p.onTenantSelect !== undefined
  ) {
    return {
      tenants: p.tenants,
      currentTenantId: p.currentTenantId,
      onTenantSelect: p.onTenantSelect,
    }
  }
  return null
}

function pickAppSwitcher(p: Props): AppSwitcherBundle | null {
  if (p.appTiles !== undefined && p.activeAppId !== undefined) {
    return { appTiles: p.appTiles, activeAppId: p.activeAppId }
  }
  return null
}

function pickAgentPanel(p: Props): AgentPanelBundle | null {
  if (
    p.agentContext !== undefined &&
    p.agentMessages !== undefined &&
    p.onAgentSubmit !== undefined
  ) {
    const out: AgentPanelBundle = {
      agentContext: p.agentContext,
      agentMessages: p.agentMessages,
      onAgentSubmit: p.onAgentSubmit,
    }
    if (p.agentStreaming !== undefined) out.agentStreaming = p.agentStreaming
    if (p.agentPending !== undefined) out.agentPending = p.agentPending
    return out
  }
  return null
}

export function AppShell(props: Props) {
  const sidebar = useSidebar()
  const panel = useAgentPanel()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const ts = pickTenantSwitcher(props)
  const as = pickAppSwitcher(props)
  const ap = pickAgentPanel(props)

  const tenantSwitcher = (collapsed: boolean) =>
    ts ? (
      <TenantSwitcher
        tenants={ts.tenants}
        currentId={ts.currentTenantId}
        onSelect={ts.onTenantSelect}
        collapsed={collapsed}
      />
    ) : undefined

  const appSwitcher = (collapsed: boolean) =>
    as ? (
      <AppSwitcher tiles={as.appTiles} activeId={as.activeAppId} collapsed={collapsed} />
    ) : undefined

  const renderAgentPanel = () =>
    ap && (
      <AgentPanel
        agentContext={ap.agentContext}
        messages={ap.agentMessages}
        {...(ap.agentStreaming !== undefined ? { streaming: ap.agentStreaming } : {})}
        {...(ap.agentPending !== undefined ? { pending: ap.agentPending } : {})}
        onClose={() => panel.set(false)}
        onSubmit={ap.onAgentSubmit}
      />
    )

  if (!isDesktop) {
    const ts0 = tenantSwitcher(false)
    const as0 = appSwitcher(false)
    return (
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-canvas">
          <TopBar
            {...(props.breadcrumb !== undefined ? { breadcrumb: props.breadcrumb } : {})}
            hasAgentPanel={ap !== null}
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
                {...(ts0 !== undefined ? { tenantSwitcher: ts0 } : {})}
                {...(as0 !== undefined ? { appSwitcher: as0 } : {})}
                {...(props.userMenu !== undefined ? { userMenu: props.userMenu } : {})}
              />
            </Dialog.Content>
          </Dialog.Root>

          {ap && (
            <Dialog.Root open={panel.open} onOpenChange={panel.set}>
              <Dialog.Content className="!right-0 !left-auto !top-0 !translate-x-0 !translate-y-0 h-full w-[85vw] max-w-[360px] rounded-none p-0">
                {renderAgentPanel()}
              </Dialog.Content>
            </Dialog.Root>
          )}
        </div>
      </TooltipProvider>
    )
  }

  const tsD = tenantSwitcher(sidebar.collapsed)
  const asD = appSwitcher(sidebar.collapsed)
  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-canvas">
        <Sidebar
          nav={props.nav}
          currentPath={props.currentPath}
          collapsed={sidebar.collapsed}
          onToggleCollapse={sidebar.toggle}
          {...(props.logo !== undefined ? { logo: props.logo } : {})}
          {...(tsD !== undefined ? { tenantSwitcher: tsD } : {})}
          {...(asD !== undefined ? { appSwitcher: asD } : {})}
          {...(props.userMenu !== undefined ? { userMenu: props.userMenu } : {})}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            {...(props.breadcrumb !== undefined ? { breadcrumb: props.breadcrumb } : {})}
            hasAgentPanel={ap !== null}
            agentPanelOpen={panel.open}
            onAgentToggle={panel.toggle}
            {...(props.notificationCount !== undefined
              ? { notificationCount: props.notificationCount }
              : {})}
            {...(props.userMenu !== undefined ? { userMenu: props.userMenu } : {})}
          />
          <main className="flex-1 overflow-y-auto p-6">{props.children}</main>
        </div>
        {ap && (
          <div
            className={cn(
              'shrink-0 transition-[width] duration-200',
              panel.open ? 'w-[360px]' : 'w-0',
            )}
          >
            {panel.open && renderAgentPanel()}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
