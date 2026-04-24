'use client'

import * as React from 'react'
import { Home, Sun, Moon, Plus } from '@future/ui/icons'
import { useTheme } from 'next-themes'
import { cn } from '@future/ui'
import { useCanAccess } from '../use-can-access'
import type { NavbarConfig } from '../types'

export interface NavbarRendererProps {
  config: NavbarConfig
  /** Slot for the user-menu trigger (e.g. SessionUserMenu). When absent, nothing renders. */
  userMenuSlot?: React.ReactNode
  /** Slot for the notifications trigger (e.g. NotificationsPopover). When absent, nothing renders. */
  notificationsSlot?: React.ReactNode
  onAgentClick?: () => void
  /** ⌘K keyboard shortcut handler — no visible search bar in navbar; search lives in sidebar. */
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
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const canDoAction = useCanAccess(config.action?.permission)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onSearchClick?.()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        onAgentClick?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSearchClick, onAgentClick])

  return (
    <header className="flex flex-shrink-0 flex-col">
      <div
        className={cn(
          'flex h-11 items-center gap-2 px-4',
          'border-b border-border bg-card/60 backdrop-blur-sm',
          'dark:border-sidebar-border dark:bg-sidebar-background/60',
        )}
      >
        {/* Breadcrumb: home / zone */}
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Home className="h-3.5 w-3.5 text-muted-foreground/40" aria-hidden="true" />
          <span className="opacity-25 select-none" aria-hidden="true">
            /
          </span>
          <span className="text-caption font-510 text-foreground">{config.title}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Ask AI toggle */}
        <button
          type="button"
          onClick={onAgentClick}
          aria-label={agentPanelOpen ? 'Close AI panel' : 'Open AI panel'}
          className={cn(
            'inline-flex h-6.5 items-center gap-1.5 rounded-md px-2 text-label font-510 border transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring/50',
            agentPanelOpen
              ? 'border-primary/25 bg-primary/10 text-primary dark:border-accent/25 dark:bg-accent/10 dark:text-accent'
              : 'border-border bg-transparent text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground',
          )}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2 9.3 5.5l3.5 1.3-3.5 1.3L8 11.6 6.7 8.1 3.2 6.8l3.5-1.3L8 2z"
              fill="currentColor"
            />
          </svg>
          <span>Ask AI</span>
          <span className="font-mono text-tiny opacity-40">⌘J</span>
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label={
            mounted && resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            'text-muted-foreground/60 transition-colors',
            'hover:bg-sidebar-accent/40 hover:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring/50',
          )}
        >
          {mounted && resolvedTheme === 'dark' ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Notifications slot */}
        {notificationsSlot}

        {/* Zone action button */}
        {config.action && canDoAction && (
          <a
            href={config.action.href}
            aria-label={config.action.label}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1',
              'bg-primary text-primary-foreground text-label font-510',
              'transition-colors hover:bg-primary/90',
              'focus:outline-none focus:ring-2 focus:ring-primary/50',
            )}
          >
            <Plus className="h-3 w-3" />
            <span className="hidden md:inline">{config.action.label}</span>
          </a>
        )}

        {/* User menu slot */}
        {userMenuSlot}
      </div>
    </header>
  )
}
