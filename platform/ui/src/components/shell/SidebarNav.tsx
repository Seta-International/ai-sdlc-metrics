import type { NavItem } from '../../types'
import { SidebarNavItem } from './SidebarNavItem'

interface Props {
  items: readonly NavItem[]
  currentPath: string
  collapsed: boolean
}

export function SidebarNav({ items, currentPath, collapsed }: Props) {
  const active = pickActive(items, currentPath)
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item) => (
        <SidebarNavItem
          key={item.id}
          icon={item.icon}
          label={item.label}
          to={item.to}
          active={item.id === active}
          collapsed={collapsed}
          {...(item.badge !== undefined ? { badge: item.badge } : {})}
        />
      ))}
    </nav>
  )
}

function pickActive(items: readonly NavItem[], path: string): string | undefined {
  let best: { id: string; len: number } | null = null
  for (const item of items) {
    if (path === item.to || path.startsWith(`${item.to}/`)) {
      if (!best || item.to.length > best.len) best = { id: item.id, len: item.to.length }
    }
  }
  return best?.id
}
