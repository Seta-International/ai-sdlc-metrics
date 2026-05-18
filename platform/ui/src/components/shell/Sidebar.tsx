import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { NavItem } from '../../types'
import { CollapseToggle } from './CollapseToggle'
import { SidebarNav } from './SidebarNav'

interface Props {
  nav: readonly NavItem[]
  currentPath: string
  collapsed: boolean
  onToggleCollapse: () => void
  logo?: ReactNode
  tenantSwitcher?: ReactNode
  appSwitcher?: ReactNode
  userMenu?: ReactNode
}

export function Sidebar({
  nav,
  currentPath,
  collapsed,
  onToggleCollapse,
  logo,
  tenantSwitcher,
  appSwitcher,
  userMenu,
}: Props) {
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col bg-sidebar-bg text-on-sidebar transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && logo}
        <CollapseToggle collapsed={collapsed} onClick={onToggleCollapse} />
      </div>
      {tenantSwitcher && (
        <div className="border-t border-[var(--color-sidebar-hairline)] px-2 py-2">
          {tenantSwitcher}
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNav items={nav} currentPath={currentPath} collapsed={collapsed} />
      </div>
      <div className="border-t border-[var(--color-sidebar-hairline)] px-2 py-2">{appSwitcher}</div>
      <div className="border-t border-[var(--color-sidebar-hairline)] px-2 py-2">{userMenu}</div>
    </aside>
  )
}
