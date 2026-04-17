'use client'

import * as React from 'react'
import { Bot, Search, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '../lib/utils'
import {
  AppLauncher,
  AppLauncherTrigger,
  AppChip,
  FUTURE_APPS,
  LOCAL_FUTURE_APPS,
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
        'flex h-7 flex-shrink-0 items-center gap-4 px-4 text-micro',
        'bg-primary/5 border-b border-primary/20 text-primary',
        'dark:bg-accent/5 dark:border-accent/20 dark:text-accent',
      )}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1 truncate text-micro">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600 flex-shrink-0" aria-hidden="true" />
        {agentName}
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      <span className="truncate text-micro">Data: {dataStatus}</span>
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      <span className="truncate text-micro">{scope}</span>
      <a
        href={auditLogHref}
        className="ml-auto truncate text-micro text-primary underline dark:text-accent"
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
  /** Slot for the user-menu trigger (e.g. SessionUserMenu). When absent, nothing renders. */
  userMenuSlot?: React.ReactNode
  /** Slot for the notifications trigger (e.g. StubNotificationsPopover). When absent, nothing renders. */
  notificationsSlot?: React.ReactNode
  /** Called when the user clicks the agent/bot icon */
  onAgentClick?: () => void
  /** Called when the user clicks the search bar */
  onSearchClick?: () => void
  /** Agent strip props — omit to hide the strip */
  agentStrip?: AgentStripProps | false
  /** Custom app list passed down to the launcher */
  apps?: AppDefinition[]
  className?: string
}

export function GlobalNav({
  currentApp,
  userMenuSlot,
  notificationsSlot,
  onAgentClick,
  onSearchClick,
  agentStrip,
  apps = process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true' ? LOCAL_FUTURE_APPS : FUTURE_APPS,
  className,
}: GlobalNavProps) {
  const [launcherOpen, setLauncherOpen] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()

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
            'dark:bg-sidebar-background dark:border-sidebar-border',
          )}
        >
          {/* Launcher trigger */}
          <AppLauncherTrigger onClick={() => setLauncherOpen(true)} />

          {/* Current app chip */}
          <AppChip app={currentAppDef} onClick={() => setLauncherOpen(true)} />

          {/* Search (expanded, sm+) */}
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Search or ask an agent"
            className={cn(
              'ml-auto hidden max-w-xs flex-1 items-center gap-2 rounded-md border px-3 py-1.5 sm:flex',
              'border-border bg-(--btn-ghost-bg) text-caption text-muted-foreground',
              'transition-all hover:bg-(--btn-ghost-bg-hover) hover:border-primary',
              'focus:outline-none focus:ring-3 focus:ring-ring/50',
            )}
          >
            <Search className="h-3 w-3 flex-shrink-0 opacity-50" aria-hidden="true" />
            <span>Search or ask…</span>
            <span className="ml-auto font-mono text-tiny opacity-50">⌘K</span>
          </button>

          {/* Search (icon-only, <sm) */}
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Search or ask an agent"
            className={cn(
              'ml-auto flex h-11 w-11 items-center justify-center rounded-md border sm:hidden',
              'border-border text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-3 focus:ring-ring/50',
            )}
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Agent toggle */}
          <button
            type="button"
            onClick={onAgentClick}
            aria-label="Open agent panel"
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md border',
              'border-border text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-3 focus:ring-ring/50',
            )}
          >
            <Bot className="h-4 w-4" />
          </button>

          {/* Notifications slot */}
          {notificationsSlot}

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md border',
              'border-border text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-3 focus:ring-ring/50',
            )}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User menu slot */}
          {userMenuSlot}
        </div>

        {/* Agent strip */}
        {agentStrip !== false && <AgentStrip {...(agentStrip ?? {})} />}
      </header>
    </>
  )
}
