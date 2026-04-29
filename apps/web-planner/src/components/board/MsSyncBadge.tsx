'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@future/ui'

export type MsSyncState = 'synced' | 'paused' | 'error' | 'none'

interface MsSyncBadgeProps {
  state: MsSyncState
  lastSyncedAt?: string | null
  lastError?: string | null
}

export function MsSyncBadge({ state, lastSyncedAt, lastError }: MsSyncBadgeProps) {
  if (state === 'none') return null

  const dot = {
    synced: 'bg-success',
    paused: 'bg-warning',
    error: 'bg-destructive',
  }[state]

  const tooltip = {
    synced: lastSyncedAt ? `Last synced ${formatRelativeTime(lastSyncedAt)}` : 'Synced with MS 365',
    paused: 'Sync paused by admin',
    error: lastError ?? 'Sync error',
  }[state]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1 cursor-default"
            data-testid="ms-sync-badge"
            aria-label={`MS 365 sync state: ${state}`}
          >
            <span className={`size-2 rounded-full ${dot}`} aria-hidden />
            <span className="text-xs text-muted-foreground">MS 365</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}
