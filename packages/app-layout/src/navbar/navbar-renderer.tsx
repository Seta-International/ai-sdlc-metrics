'use client'

import * as React from 'react'
import { Bell, Bot, Search, Sun, Moon, Plus } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn, AppLauncher, AppLauncherTrigger, FUTURE_APPS, LOCAL_FUTURE_APPS } from '@future/ui'
import { SidebarTrigger } from '@future/ui'
import { useCanAccess } from '../use-can-access'
import type { NavbarConfig } from '../types'

export interface NavbarRendererProps {
  config: NavbarConfig
  userInitials?: string
  onNotificationsClick?: () => void
  onAgentClick?: () => void
  onSearchClick?: () => void
  onProfileClick?: () => void
}

export function NavbarRenderer({
  config,
  userInitials = 'U',
  onNotificationsClick,
  onAgentClick,
  onSearchClick,
  onProfileClick,
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

      <header className={cn('flex flex-col flex-shrink-0')}>
        <div
          className={cn(
            'flex h-12 items-center gap-3 px-4',
            'bg-card border-b border-border',
            'dark:bg-[#0f1011] dark:border-[rgba(255,255,255,0.05)]',
          )}
        >
          {/* Sidebar toggle (mobile hamburger / desktop collapse) */}
          <SidebarTrigger />

          {/* App launcher */}
          <AppLauncherTrigger onClick={() => setLauncherOpen(true)} />

          {/* Zone title */}
          <div className="flex items-center gap-2">
            <config.icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-[510]">{config.title}</span>
          </div>

          {/* Action button */}
          {config.action && canDoAction && (
            <a
              href={config.action.href}
              className={cn(
                'ml-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                'bg-[#5e6ad2] text-white text-xs font-[510]',
                'transition-all hover:bg-[#828fff]',
                'focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/50',
              )}
            >
              <Plus className="h-3 w-3" />
              {config.action.label}
            </a>
          )}

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
            <span>Search or ask...</span>
            <span className="ml-auto font-mono text-[10px] opacity-50">⌘K</span>
          </button>

          {/* Agent toggle */}
          <button
            type="button"
            onClick={onAgentClick}
            aria-label="Open agent panel"
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md',
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
              'flex h-11 w-11 items-center justify-center rounded-md',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Bell className="h-4 w-4" />
          </button>

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
      </header>
    </>
  )
}
