import { Bot, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Breadcrumb, type Crumb } from './Breadcrumb'
import { NotificationBell } from './NotificationBell'

interface Props {
  breadcrumb?: readonly Crumb[]
  hasAgentPanel?: boolean
  agentPanelOpen: boolean
  onAgentToggle?: () => void
  onSearch?: () => void
  notificationCount?: number
  onNotificationsClick?: () => void
  userMenu?: ReactNode
}

export function TopBar({
  breadcrumb = [],
  hasAgentPanel = true,
  agentPanelOpen,
  onAgentToggle,
  onSearch,
  notificationCount = 0,
  onNotificationsClick,
  userMenu,
}: Props) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-hairline bg-canvas px-5">
      <div className="min-w-0 flex-1">
        <Breadcrumb items={breadcrumb} />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search"
          className="inline-flex size-9 items-center justify-center rounded-md text-ink-mute hover:bg-canvas-subtle"
        >
          <Search className="size-5 stroke-[1.5]" />
        </button>
        <NotificationBell
          count={notificationCount}
          {...(onNotificationsClick !== undefined && { onClick: onNotificationsClick })}
        />
        {hasAgentPanel && (
          <button
            type="button"
            onClick={onAgentToggle}
            aria-label="Agent panel"
            aria-pressed={agentPanelOpen}
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-md transition-colors',
              agentPanelOpen
                ? 'bg-primary-subtle text-primary'
                : 'text-ink-mute hover:bg-canvas-subtle',
            )}
          >
            <Bot className="size-5 stroke-[1.5]" />
          </button>
        )}
        {userMenu}
      </div>
    </header>
  )
}
