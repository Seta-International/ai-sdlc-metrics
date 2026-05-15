import * as Pop from '@radix-ui/react-popover'
import { LayoutGrid } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Tooltip } from '../feedback/Tooltip'

export interface AppTile {
  id: string
  name: string
  shortcut: string
  available: boolean
  href?: string
}

interface Props {
  tiles: readonly AppTile[]
  activeId: string
  collapsed: boolean
}

export function AppSwitcher({ tiles, activeId, collapsed }: Props) {
  const trigger = (
    <Pop.Trigger
      aria-label="Apps"
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-md px-2 text-[14px] text-on-sidebar-subtle hover:bg-sidebar-surface-1 hover:text-on-sidebar-muted',
        collapsed && 'justify-center',
      )}
    >
      <LayoutGrid className="size-4 stroke-[1.5]" />
      {!collapsed && <span>Apps</span>}
    </Pop.Trigger>
  )
  return (
    <Pop.Root>
      {collapsed ? (
        <Tooltip content="Apps" side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <Pop.Portal>
        <Pop.Content
          side={collapsed ? 'right' : 'top'}
          align="start"
          sideOffset={6}
          className="z-50 grid w-64 grid-cols-2 gap-2 rounded-md border border-hairline bg-canvas p-2 shadow-float"
        >
          {tiles.map((t) => {
            const active = t.id === activeId
            const tileClass = cn(
              'flex flex-col items-center justify-center gap-1 rounded-md p-3 text-[12px] text-on-sidebar transition-colors',
              active && 'border-2 border-primary bg-primary/10',
              !t.available && 'pointer-events-none opacity-25',
              t.available && !active && 'border border-hairline bg-canvas-subtle text-ink',
            )
            return t.available && t.href ? (
              <a key={t.id} href={t.href}>
                <div className={tileClass}>
                  <span className="text-[14px] font-medium">[{t.shortcut}]</span>
                  <span>{t.name}</span>
                </div>
              </a>
            ) : (
              <Tooltip key={t.id} content="Coming soon" side="top">
                <div className={tileClass}>
                  <span className="text-[14px] font-medium">[{t.shortcut}]</span>
                  <span>{t.name}</span>
                </div>
              </Tooltip>
            )
          })}
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  )
}
