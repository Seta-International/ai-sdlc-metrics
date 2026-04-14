'use client'

import * as React from 'react'
import { Bell, Bot, Search } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  AppLauncher,
  AppLauncherTrigger,
  AppChip,
  FUTURE_APPS,
  type AppDefinition,
} from './app-launcher'

// ─── Agent Strip ─────────────────────────────────────────────────────────────

export interface AgentStripProps {
  /** Agent name, e.g. "Kernel v2.1" */
  agentName?: string
  /** Data freshness label, e.g. "live · 1m ago" */
  dataStatus?: string
  /** Authority scope label, e.g. "read-only · Engineering" */
  scope?: string
  auditLogHref?: string
}

export function AgentStrip({
  agentName = 'Kernel v2.1',
  dataStatus = 'live',
  scope = 'read-only',
  auditLogHref = '#',
}: AgentStripProps) {
  return (
    <div
      className={cn(
        'flex h-7 flex-shrink-0 items-center gap-4 px-4 text-[11px]',
        'bg-[rgba(94,106,210,0.05)] border-b border-[rgba(94,106,210,0.2)] text-[#5e6ad2]',
        'dark:bg-[rgba(113,112,255,0.06)] dark:border-[rgba(113,112,255,0.15)] dark:text-[#7170ff]',
      )}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600 flex-shrink-0" aria-hidden="true" />
        {agentName}
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      <span>Data: {dataStatus}</span>
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      <span>{scope}</span>
      <a
        href={auditLogHref}
        className="ml-auto text-[11px] text-[#5e6ad2] underline dark:text-[#7170ff]"
      >
        View audit log
      </a>
    </div>
  )
}

// ─── GlobalNav ───────────────────────────────────────────────────────────────

export interface GlobalNavProps {
  /**
   * ID of the current app zone (e.g. "projects"). Matches AppDefinition.id.
   * Controls the App Chip label and the current-app badge in the launcher.
   */
  currentApp?: string
  /** Initials or name for the avatar button */
  userInitials?: string
  /** Called when the user clicks the notification bell */
  onNotificationsClick?: () => void
  /** Called when the user clicks the agent/bot icon */
  onAgentClick?: () => void
  /** Called when the user clicks the search bar */
  onSearchClick?: () => void
  /** Called when the user clicks the avatar */
  onProfileClick?: () => void
  /** Agent strip props — omit to hide the strip */
  agentStrip?: AgentStripProps | false
  /** Custom app list passed down to the launcher */
  apps?: AppDefinition[]
  className?: string
}

export function GlobalNav({
  currentApp,
  userInitials = 'U',
  onNotificationsClick,
  onAgentClick,
  onSearchClick,
  onProfileClick,
  agentStrip,
  apps = FUTURE_APPS,
  className,
}: GlobalNavProps) {
  const [launcherOpen, setLauncherOpen] = React.useState(false)

  // ⌘K / Ctrl+K opens the launcher
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setLauncherOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const currentAppDef = apps.find((a) => a.id === currentApp)

  return (
    <>
      <AppLauncher
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        currentApp={currentApp}
        apps={apps}
      />

      <header className={cn('flex flex-col flex-shrink-0', className)}>
        {/* Topbar */}
        <div
          className={cn(
            'flex h-12 items-center gap-3 px-4',
            'bg-card border-b border-border',
            'dark:bg-[#0f1011] dark:border-[rgba(255,255,255,0.05)]',
          )}
        >
          {/* Launcher trigger */}
          <AppLauncherTrigger onClick={() => setLauncherOpen(true)} />

          {/* Current app chip */}
          <AppChip app={currentAppDef} onClick={() => setLauncherOpen(true)} />

          {/* Search */}
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Search or ask an agent"
            className={cn(
              'ml-auto flex max-w-[260px] flex-1 items-center gap-2 rounded-md border px-3 py-1.5',
              'border-border bg-(--btn-ghost-bg) text-xs text-muted-foreground',
              'transition-all hover:bg-(--btn-ghost-bg-hover) hover:border-[#5e6ad2]',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Search className="h-3 w-3 flex-shrink-0 opacity-50" aria-hidden="true" />
            <span>Search or ask…</span>
            <span className="ml-auto font-mono text-[10px] opacity-50">⌘K</span>
          </button>

          {/* Agent toggle */}
          <button
            type="button"
            onClick={onAgentClick}
            aria-label="Open agent panel"
            className={cn(
              'flex h-7.5 w-7.5 items-center justify-center rounded-md',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Bot className="h-4 w-4" />
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label="Notifications"
            className={cn(
              'flex h-7.5 w-7.5 items-center justify-center rounded-md',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Bell className="h-4 w-4" />
          </button>

          {/* Avatar */}
          <button
            type="button"
            onClick={onProfileClick}
            aria-label={`User menu (${userInitials})`}
            className={cn(
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
              'bg-[#5e6ad2] text-[11px] font-[510] text-white',
              'transition-all hover:bg-[#828fff]',
              'focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/50',
            )}
          >
            {userInitials.slice(0, 2).toUpperCase()}
          </button>
        </div>

        {/* Agent strip */}
        {agentStrip !== false && <AgentStrip {...(agentStrip ?? {})} />}
      </header>
    </>
  )
}
