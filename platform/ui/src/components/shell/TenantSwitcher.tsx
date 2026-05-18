import * as Pop from '@radix-ui/react-popover'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { Tenant } from '../../types'
import { Tooltip } from '../feedback/Tooltip'

interface Props {
  tenants: readonly Tenant[]
  currentId: string
  onSelect: (id: string) => void
  collapsed: boolean
}

export function TenantSwitcher({ tenants, currentId, onSelect, collapsed }: Props) {
  const current = tenants.find((t) => t.id === currentId)
  const trigger = (
    <Pop.Trigger
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-on-sidebar',
        'hover:bg-sidebar-surface-1',
        collapsed && 'justify-center',
      )}
    >
      {collapsed ? (
        <span className="inline-flex size-6 items-center justify-center rounded-md bg-white/10 text-[12px] font-medium">
          {current?.name.charAt(0) ?? '?'}
        </span>
      ) : (
        <>
          <Building2 className="size-4 stroke-[1.5] text-on-sidebar-subtle" />
          <span className="flex-1 truncate">{current?.name ?? 'No tenant'}</span>
          <ChevronDown className="size-3.5 stroke-[1.5] text-on-sidebar-subtle" />
        </>
      )}
    </Pop.Trigger>
  )
  return (
    <Pop.Root>
      {collapsed ? (
        <Tooltip content={current?.name ?? ''} side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <Pop.Portal>
        <Pop.Content
          side={collapsed ? 'right' : 'bottom'}
          align="start"
          sideOffset={6}
          className="z-50 w-56 rounded-md border border-hairline bg-canvas p-1 shadow-float"
        >
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[14px] text-ink hover:bg-canvas-subtle"
            >
              <Building2 className="size-4 stroke-[1.5] text-ink-mute" />
              <span className="flex-1 truncate">{t.name}</span>
              {t.id === currentId && <Check className="size-3.5 stroke-[1.5] text-primary" />}
            </button>
          ))}
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  )
}
