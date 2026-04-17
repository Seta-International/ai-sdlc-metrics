'use client'

import * as React from 'react'
import { Bot, Search, Sun, Moon, Plus } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn, AppLauncher, AppLauncherTrigger, FUTURE_APPS, LOCAL_FUTURE_APPS } from '@future/ui'
import { SidebarTrigger } from '@future/ui'
import { useCanAccess } from '../use-can-access'
import type { NavbarConfig } from '../types'

export interface NavbarRendererProps {
  config: NavbarConfig
  /** Slot for the user-menu trigger (e.g. SessionUserMenu). When absent, nothing renders. */
  userMenuSlot?: React.ReactNode
  /** Slot for the notifications trigger (e.g. StubNotificationsPopover). When absent, nothing renders. */
  notificationsSlot?: React.ReactNode
  onAgentClick?: () => void
  onSearchClick?: () => void
  agentPanelOpen?: boolean
}

export function NavbarRenderer({
  config,
  userMenuSlot,
  notificationsSlot,
  onAgentClick,
  onSearchClick,
  agentPanelOpen = false,
}: NavbarRendererProps) {
  const [launcherOpen, setLauncherOpen] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const canDoAction = useCanAccess(config.action?.permission)

  const apps = process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true' ? LOCAL_FUTURE_APPS : FUTURE_APPS

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

  return (
    <>
      <AppLauncher open={launcherOpen} onOpenChange={setLauncherOpen} apps={apps} />

      <header className={cn('flex flex-shrink-0 flex-col')}>
        <div
          className={cn(
            'flex h-12 items-center gap-3 px-4',
            'bg-card border-b border-border',
            'dark:bg-sidebar-background dark:border-sidebar-border',
          )}
        >
          {/* Sidebar toggle (mobile hamburger / desktop collapse) */}
          <SidebarTrigger />

          {/* App launcher */}
          <AppLauncherTrigger onClick={() => setLauncherOpen(true)} />

          {/* Zone title */}
          <div className="flex items-center gap-2">
            <config.icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-510">{config.title}</span>
          </div>

          {/* Action button (label hidden on <md, icon kept) */}
          {config.action && canDoAction && (
            <a
              href={config.action.href}
              aria-label={config.action.label}
              className={cn(
                'ml-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                'bg-primary text-primary-foreground text-xs font-510',
                'transition-all hover:bg-primary/90',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
              )}
            >
              <Plus className="h-3 w-3" />
              <span className="hidden md:inline">{config.action.label}</span>
            </a>
          )}

          {/* Search (expanded, sm+) */}
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Search or ask an agent"
            className={cn(
              'ml-auto hidden max-w-xs flex-1 items-center gap-2 rounded-md border px-3 py-1.5 sm:flex',
              'border-border bg-(--btn-ghost-bg) text-xs text-muted-foreground',
              'transition-all hover:bg-(--btn-ghost-bg-hover) hover:border-primary',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Search className="h-3 w-3 flex-shrink-0 opacity-50" aria-hidden="true" />
            <span>Search or ask...</span>
            <span className="ml-auto font-mono text-tiny opacity-50">⌘K</span>
          </button>

          {/* Search (icon-only, <sm) */}
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Search or ask an agent"
            className={cn(
              'ml-auto flex h-11 w-11 items-center justify-center rounded-md sm:hidden',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Agent toggle */}
          <button
            type="button"
            onClick={onAgentClick}
            aria-label={agentPanelOpen ? 'Close agent panel' : 'Open agent panel'}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border transition-all',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
              agentPanelOpen
                ? 'border-border bg-primary text-primary-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-(--btn-ghost-bg) hover:text-foreground',
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
              'flex h-11 w-11 items-center justify-center rounded-md',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User menu slot */}
          {userMenuSlot}
        </div>
      </header>
    </>
  )
}
