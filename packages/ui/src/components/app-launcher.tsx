'use client'

import * as React from 'react'
import {
  Grid2X2,
  ChevronDown,
  Users,
  Clock,
  Briefcase,
  TrendingUp,
  FolderOpen,
  DollarSign,
  Target,
  BarChart2,
  ListTodo,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'

// ─── App Registry ───────────────────────────────────────────────────────────

export interface AppDefinition {
  id: string
  name: string
  href: string
  /**
   * Lucide icon component for the app tile.
   * Falls back to Grid2X2 if not provided.
   */
  Icon?: LucideIcon
  /**
   * Accent color class for icon background (e.g. 'bg-blue-500/15 text-blue-400').
   * Used in both light and dark modes with opacity.
   */
  accent?: string
}

/** Icon + accent palette per app — consistent, DESIGN.md-aligned */
const APP_ICONS: Record<string, { Icon: LucideIcon; accent: string }> = {
  people: {
    Icon: Users,
    accent: 'bg-blue-600/15 text-blue-400 dark:bg-blue-600/15 dark:text-blue-400',
  },
  time: {
    Icon: Clock,
    accent: 'bg-cyan-500/15 text-cyan-400 dark:bg-cyan-500/15 dark:text-cyan-400',
  },
  hiring: {
    Icon: Briefcase,
    accent: 'bg-violet-600/15 text-violet-400 dark:bg-violet-600/15 dark:text-violet-400',
  },
  performance: {
    Icon: TrendingUp,
    accent: 'bg-amber-600/15 text-amber-400 dark:bg-amber-600/15 dark:text-amber-400',
  },
  projects: {
    Icon: FolderOpen,
    accent: 'bg-emerald-600/15 text-emerald-400 dark:bg-emerald-600/15 dark:text-emerald-400',
  },
  finance: {
    Icon: DollarSign,
    accent: 'bg-red-600/15 text-red-300 dark:bg-red-600/15 dark:text-red-300',
  },
  goals: {
    Icon: Target,
    accent: 'bg-pink-700/15 text-pink-300 dark:bg-pink-700/15 dark:text-pink-300',
  },
  insights: {
    Icon: BarChart2,
    accent: 'bg-blue-700/15 text-blue-300 dark:bg-blue-700/15 dark:text-blue-300',
  },
  planner: {
    Icon: ListTodo,
    accent: 'bg-teal-600/15 text-teal-400 dark:bg-teal-600/15 dark:text-teal-400',
  },
  admin: {
    Icon: Settings,
    accent: 'bg-secondary text-muted-foreground dark:bg-secondary dark:text-muted-foreground',
  },
}

// Order: employee lifecycle → delivery → strategic → AI → ops → admin
export const LOCAL_FUTURE_APPS: AppDefinition[] = [
  { id: 'people', name: 'People', href: 'http://localhost:3001' },
  { id: 'hiring', name: 'Hiring', href: 'http://localhost:3003' },
  { id: 'time', name: 'Time', href: 'http://localhost:3002' },
  { id: 'performance', name: 'Performance', href: 'http://localhost:3004' },
  { id: 'goals', name: 'Goals', href: 'http://localhost:3007' },
  { id: 'projects', name: 'Projects', href: 'http://localhost:3005' },
  { id: 'finance', name: 'Finance', href: 'http://localhost:3006' },
  { id: 'planner', name: 'Planner', href: 'http://localhost:3011' },
  { id: 'insights', name: 'Insights', href: 'http://localhost:3008' },
  { id: 'admin', name: 'Admin', href: 'http://localhost:3010' },
]

export const FUTURE_APPS: AppDefinition[] = [
  { id: 'people', name: 'People', href: 'https://people.future.seta.vn' },
  { id: 'hiring', name: 'Hiring', href: 'https://hiring.future.seta.vn' },
  { id: 'time', name: 'Time', href: 'https://time.future.seta.vn' },
  { id: 'performance', name: 'Performance', href: 'https://performance.future.seta.vn' },
  { id: 'goals', name: 'Goals', href: 'https://goals.future.seta.vn' },
  { id: 'projects', name: 'Projects', href: 'https://projects.future.seta.vn' },
  { id: 'finance', name: 'Finance', href: 'https://finance.future.seta.vn' },
  { id: 'planner', name: 'Planner', href: 'https://planner.future.seta.vn' },
  { id: 'insights', name: 'Insights', href: 'https://insights.future.seta.vn' },
  { id: 'admin', name: 'Admin', href: 'https://admin.future.seta.vn' },
]

// ─── Keyboard shortcut hint ──────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-secondary px-1.5 py-px font-mono text-xs text-muted-foreground">
      {children}
    </span>
  )
}

// ─── AppLauncher ─────────────────────────────────────────────────────────────

export interface AppLauncherProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** ID of the currently active app (e.g. "projects") */
  currentApp?: string
  /** Custom app list — defaults to FUTURE_APPS */
  apps?: AppDefinition[]
}

type Tab = 'apps' | 'search' | 'recent'

export function AppLauncher({
  open,
  onOpenChange,
  currentApp,
  apps = FUTURE_APPS,
}: AppLauncherProps) {
  const [query, setQuery] = React.useState('')
  const [tab, setTab] = React.useState<Tab>('apps')
  const [focusedIndex, setFocusedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const gridRef = React.useRef<HTMLDivElement>(null)

  // Reset state when opening
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setTab('apps')
      setFocusedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Close on Escape, keyboard grid navigation
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
        return
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return
      e.preventDefault()

      const tiles = gridRef.current?.querySelectorAll<HTMLAnchorElement>('[data-tile]')
      if (!tiles || tiles.length === 0) return

      const cols = window.innerWidth <= 500 ? 3 : 4
      const count = tiles.length

      let next = focusedIndex
      if (e.key === 'ArrowRight') next = Math.min(focusedIndex + 1, count - 1)
      if (e.key === 'ArrowLeft') next = Math.max(focusedIndex - 1, 0)
      if (e.key === 'ArrowDown') next = Math.min(focusedIndex + cols, count - 1)
      if (e.key === 'ArrowUp') next = Math.max(focusedIndex - cols, 0)
      if (e.key === 'Enter') {
        tiles[focusedIndex]?.click()
        return
      }

      setFocusedIndex(next)
      tiles[next]?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, focusedIndex, onOpenChange])

  // Filtered apps
  const filteredApps = React.useMemo(() => {
    if (!query) return apps
    const q = query.toLowerCase()
    return apps.filter((a) => a.name.toLowerCase().includes(q))
  }, [apps, query])

  // Recent apps — last 3 visited excluding current (stored in localStorage)
  const recentApps = React.useMemo(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('future:recent-apps')
      const ids: string[] = raw ? JSON.parse(raw) : []
      return ids
        .filter((id) => id !== currentApp)
        .slice(0, 3)
        .map((id) => apps.find((a) => a.id === id))
        .filter((a): a is AppDefinition => Boolean(a))
    } catch {
      return []
    }
  }, [apps, currentApp, open]) // re-read when launcher opens

  // Persist visited app to recent
  const handleTileClick = (app: AppDefinition) => {
    try {
      const raw = localStorage.getItem('future:recent-apps')
      const ids: string[] = raw ? JSON.parse(raw) : []
      const updated = [app.id, ...ids.filter((id) => id !== app.id)].slice(0, 5)
      localStorage.setItem('future:recent-apps', JSON.stringify(updated))
    } catch {
      // localStorage unavailable
    }
  }

  const displayApps = tab === 'recent' ? recentApps : tab === 'search' ? filteredApps : apps

  if (!open) return null

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="App launcher"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal */}
      <div
        className={cn(
          'relative z-10 w-full max-w-2xl mx-4',
          'rounded-xl border border-border',
          'bg-popover shadow-xl',
          'animate-in fade-in slide-in-from-top-2 duration-200',
          'overflow-hidden',
        )}
      >
        {/* Radial glow — brand indigo tint at top */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%,rgba(94,106,210,0.10) 0%,transparent 60%)',
          }}
          aria-hidden="true"
        />

        {/* Search bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Grid2X2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search Future apps or anything…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (tab !== 'search' && e.target.value) setTab('search')
              if (!e.target.value && tab === 'search') setTab('apps')
            }}
            aria-label="Search apps"
          />
          <Kbd>ESC</Kbd>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-4" role="tablist">
          {(['apps', 'search', 'recent'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-xs font-510 capitalize transition-all',
                'border-b-2 -mb-px',
                tab === t
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* App grid */}
        <div className="p-5">
          {displayApps.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {tab === 'recent' ? 'No recently visited apps.' : 'No apps found.'}
            </p>
          ) : (
            <>
              <div className="mb-3 text-xs font-510 uppercase tracking-widest text-muted-foreground">
                {tab === 'recent' ? 'Recently visited' : 'Your apps'}
              </div>
              <div
                ref={gridRef}
                className="grid grid-cols-4 gap-2 max-[500px]:grid-cols-3"
                role="list"
              >
                {displayApps.map((app, idx) => {
                  const isCurrent = app.id === currentApp
                  const appIcon = APP_ICONS[app.id]
                  const IconComponent = app.Icon ?? appIcon?.Icon ?? Grid2X2
                  const accentClass = app.accent ?? appIcon?.accent ?? ''

                  return (
                    <a
                      key={app.id}
                      data-tile
                      href={app.href}
                      role="listitem"
                      aria-label={`Open ${app.name}${isCurrent ? ' (current)' : ''}`}
                      aria-current={isCurrent ? true : undefined}
                      onClick={() => handleTileClick(app)}
                      onFocus={() => setFocusedIndex(idx)}
                      className={cn(
                        'relative flex flex-col items-center gap-2 rounded-lg border px-2 pb-3.5 pt-4',
                        'cursor-pointer no-underline transition-all focus:outline-none',
                        'focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-popover',
                        isCurrent
                          ? 'border-accent/35 bg-accent/10'
                          : 'border-transparent hover:border-border hover:bg-secondary',
                      )}
                    >
                      {/* Icon */}
                      <div
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-lg flex-shrink-0',
                          accentClass,
                        )}
                        aria-hidden="true"
                      >
                        <IconComponent className="h-5 w-5" />
                      </div>

                      {/* Name */}
                      <span
                        className={cn(
                          'text-center text-micro font-510 leading-tight',
                          isCurrent ? 'text-accent' : 'text-foreground/80',
                        )}
                      >
                        {app.name}
                      </span>

                      {/* Current badge */}
                      {isCurrent && (
                        <span
                          className="absolute right-2 top-2 size-1.5 rounded-full bg-emerald-500 ring-1 ring-popover"
                          aria-label="Currently open"
                        />
                      )}
                    </a>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5">
          <span className="text-micro text-muted-foreground">
            {currentApp ? (
              <>
                Currently in:{' '}
                <strong className="text-foreground/70">
                  {apps.find((a) => a.id === currentApp)?.name ?? currentApp}
                </strong>
              </>
            ) : (
              'Future OS'
            )}
          </span>
          <div className="flex items-center gap-2 text-micro text-muted-foreground">
            <Kbd>↑↓←→</Kbd> navigate
            <Kbd>↵</Kbd> open
            <Kbd>ESC</Kbd> close
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Launcher trigger button ─────────────────────────────────────────────────

export interface AppLauncherTriggerProps {
  onClick: () => void
  className?: string
}

export function AppLauncherTrigger({ onClick, className }: AppLauncherTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open app launcher (⌘K)"
      title="Open app launcher (⌘K)"
      className={cn(
        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded',
        'bg-primary text-primary-foreground text-xs font-510',
        'transition-all hover:bg-primary/90 hover:scale-[1.06]',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-background',
        className,
      )}
    >
      <Grid2X2 className="h-3.5 w-3.5" />
    </button>
  )
}

// ─── App chip (topbar current-app indicator) ────────────────────────────────

export interface AppChipProps {
  app?: AppDefinition
  onClick?: () => void
  className?: string
}

export function AppChip({ app, onClick, className }: AppChipProps) {
  const appIcon = app ? APP_ICONS[app.id] : undefined
  const IconComponent = app?.Icon ?? appIcon?.Icon

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={app ? `Currently in ${app.name} — click to switch app` : 'Switch app'}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5',
        'border-border bg-secondary text-micro font-510 text-secondary-foreground',
        'transition-all hover:border-primary/40 hover:text-primary',
        'focus:outline-none focus:ring-2 focus:ring-accent',
        'dark:border-border dark:bg-secondary dark:text-secondary-foreground',
        'dark:hover:border-accent/40 dark:hover:text-accent',
        className,
      )}
    >
      {IconComponent && (
        <IconComponent className="h-3 w-3 opacity-70 flex-shrink-0" aria-hidden="true" />
      )}
      <span>{app?.name ?? 'Apps'}</span>
      <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}
