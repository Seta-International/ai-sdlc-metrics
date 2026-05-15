import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Tooltip } from '../feedback/Tooltip'

interface Props {
  icon: LucideIcon
  label: string
  to: string
  active: boolean
  collapsed: boolean
  badge?: number | string
}

export function SidebarNavItem({ icon: Icon, label, to, active, collapsed, badge }: Props) {
  const link = (
    <a
      href={to}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md px-2.5 text-[14px] transition-colors',
        active
          ? 'bg-sidebar-surface-2 text-primary-hover font-medium'
          : 'text-on-sidebar-subtle hover:bg-sidebar-surface-1 hover:text-on-sidebar-muted',
        collapsed && 'justify-center',
      )}
    >
      <Icon
        className={cn(
          'size-4 stroke-[1.5]',
          active
            ? 'text-primary-hover'
            : 'text-on-sidebar-subtle group-hover:text-on-sidebar-muted',
        )}
      />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className="rounded-pill bg-white/10 px-1.5 text-[11px] font-medium tnum text-on-sidebar-muted">
          {badge}
        </span>
      )}
    </a>
  )
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}
