'use client'

import * as React from 'react'
import { Bell } from 'lucide-react'
import { cn } from '../lib/utils'
import { useIsMobile } from '../hooks/use-mobile'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'

export interface NotificationItem {
  id: string
  title: string
  body?: string
  href?: string
  /** ISO 8601 timestamp */
  createdAt: string
  read: boolean
  severity?: 'info' | 'warning' | 'critical'
}

export interface NotificationsPopoverProps {
  notifications: readonly NotificationItem[]
  unreadCount: number
  isLoading?: boolean
  onRead: (id: string) => void
  onReadAll: () => void
  /** Renders the "See all" footer when provided. */
  onOpenAll?: () => void
  /** Default: "You're all caught up". */
  emptyStateHint?: string
}

const MAX_VISIBLE = 20
const DEFAULT_EMPTY_HINT = "You're all caught up"

export function NotificationsPopover({
  notifications,
  unreadCount,
  isLoading = false,
  onRead,
  onReadAll,
  onOpenAll,
  emptyStateHint,
}: NotificationsPopoverProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)

  const visible = notifications.slice(0, MAX_VISIBLE)
  const hasItems = visible.length > 0
  const showEmpty = !hasItems && !isLoading
  const showSkeletons = !hasItems && isLoading
  const disableMarkAll = unreadCount === 0

  const trigger = (
    <button
      type="button"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      className={cn(
        'relative flex h-7 w-7 items-center justify-center rounded-md',
        'text-muted-foreground/60 transition-colors',
        'hover:bg-sidebar-accent/40 hover:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring/50',
      )}
    >
      <Bell className="h-3.5 w-3.5" />
      {unreadCount > 0 ? (
        <span
          data-testid="notifications-bell-badge"
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-tiny font-semibold leading-none text-white ring-1.5 ring-background"
        >
          {unreadCount}
        </span>
      ) : null}
    </button>
  )

  const body = (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-caption-lg font-510 text-foreground">Notifications</span>
        <button
          type="button"
          disabled={disableMarkAll}
          onClick={onReadAll}
          className={cn(
            'text-micro text-accent transition-opacity',
            'hover:opacity-80 focus:outline-none focus:ring-3 focus:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50',
          )}
        >
          Mark all read
        </button>
      </div>

      {showEmpty ? (
        <div className="flex items-center justify-center px-4 py-10 text-small text-muted-foreground">
          {emptyStateHint ?? DEFAULT_EMPTY_HINT}
        </div>
      ) : null}

      {showSkeletons ? (
        <div className="flex flex-col">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              data-testid="notifications-skeleton-row"
              className="flex items-start gap-3 border-b border-border/40 px-4 py-3"
            >
              <Skeleton className="h-2 w-2 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {hasItems ? (
        <ScrollArea className="max-h-96">
          <ul className="flex flex-col">
            {visible.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} onRead={onRead} />
              </li>
            ))}
          </ul>
        </ScrollArea>
      ) : null}

      {onOpenAll ? (
        <div className="border-t border-border px-4 py-2 text-center">
          <button
            type="button"
            onClick={onOpenAll}
            className="text-micro text-accent hover:opacity-80 focus:outline-none focus:ring-3 focus:ring-ring/50"
          >
            See all →
          </button>
        </div>
      ) : null}
    </>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="right"
          data-testid="notifications-sheet-content"
          className="flex w-full flex-col gap-0 p-0 sm:w-96"
        >
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        data-testid="notifications-popover-content"
        className="w-96 rounded-lg p-0"
      >
        {body}
      </PopoverContent>
    </Popover>
  )
}

interface NotificationRowProps {
  item: NotificationItem
  onRead: (id: string) => void
}

function NotificationRow({ item, onRead }: NotificationRowProps) {
  const handleClick = () => {
    onRead(item.id)
    if (item.href) {
      // Cross-zone navigation: hard reload, not Next.js <Link>.
      window.location.href = item.href
    }
  }

  const pillSeverity: 'warning' | 'critical' | null =
    item.severity === 'warning' || item.severity === 'critical' ? item.severity : null

  return (
    <button
      type="button"
      data-testid="notifications-item"
      onClick={handleClick}
      className={cn(
        'flex w-full min-h-11 items-start gap-3 border-b border-border/40 px-4 py-3 text-left',
        'transition-colors hover:bg-overlay/5 focus:outline-none focus:ring-3 focus:ring-ring/50',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full',
          item.read ? 'bg-transparent' : 'bg-accent',
        )}
      />
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <span
          className={cn(
            'text-caption font-510 truncate',
            item.read ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {item.title}
        </span>
        {item.body ? (
          <span className="text-label text-muted-foreground line-clamp-2">{item.body}</span>
        ) : null}
      </div>
      {pillSeverity ? <SeverityPill severity={pillSeverity} /> : null}
    </button>
  )
}

interface SeverityPillProps {
  severity: 'warning' | 'critical'
}

function SeverityPill({ severity }: SeverityPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs bg-overlay/5 px-1.5 text-micro font-510',
        severity === 'critical' ? 'text-destructive' : 'text-(--color-text-warning)',
      )}
    >
      {severity}
    </span>
  )
}
