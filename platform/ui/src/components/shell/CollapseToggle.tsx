import { PanelLeft } from 'lucide-react'

interface Props {
  collapsed: boolean
  onClick: () => void
}

export function CollapseToggle({ collapsed, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="inline-flex size-8 items-center justify-center rounded-md text-on-sidebar-subtle hover:bg-sidebar-surface-1 hover:text-on-sidebar-muted"
    >
      <PanelLeft className="size-4 stroke-[1.5]" />
    </button>
  )
}
