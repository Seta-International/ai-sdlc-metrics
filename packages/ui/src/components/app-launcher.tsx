'use client'

import * as React from 'react'
import { Grid2X2, Search, X, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

// ─── App Registry ───────────────────────────────────────────────────────────

export interface AppDefinition {
  id: string
  name: string
  href: string
  /** Emoji or single character icon */
  icon: string
  /** CSS gradient string */
  color: string
}

export const FUTURE_APPS: AppDefinition[] = [
  {
    id: 'people',
    name: 'People',
    href: 'https://people.future.seta.vn',
    icon: '👥',
    color: 'linear-gradient(135deg,#2563EB,#3B82F6)',
  },
  {
    id: 'time',
    name: 'Time',
    href: 'https://time.future.seta.vn',
    icon: '⏱',
    color: 'linear-gradient(135deg,#0891B2,#06B6D4)',
  },
  {
    id: 'hiring',
    name: 'Hiring',
    href: 'https://hiring.future.seta.vn',
    icon: '💼',
    color: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  },
  {
    id: 'performance',
    name: 'Performance',
    href: 'https://performance.future.seta.vn',
    icon: '🏆',
    color: 'linear-gradient(135deg,#D97706,#F59E0B)',
  },
  {
    id: 'projects',
    name: 'Projects',
    href: 'https://projects.future.seta.vn',
    icon: '📁',
    color: 'linear-gradient(135deg,#059669,#10B981)',
  },
  {
    id: 'finance',
    name: 'Finance',
    href: 'https://finance.future.seta.vn',
    icon: '💰',
    color: 'linear-gradient(135deg,#DC2626,#EF4444)',
  },
  {
    id: 'goals',
    name: 'Goals',
    href: 'https://goals.future.seta.vn',
    icon: '🎯',
    color: 'linear-gradient(135deg,#BE185D,#EC4899)',
  },
  {
    id: 'insights',
    name: 'Insights',
    href: 'https://insights.future.seta.vn',
    icon: '📊',
    color: 'linear-gradient(135deg,#1D4ED8,#60A5FA)',
  },
  {
    id: 'agents',
    name: 'Agents',
    href: 'https://agents.future.seta.vn',
    icon: '🤖',
    color: 'linear-gradient(135deg,#374151,#6B7280)',
  },
  {
    id: 'planner',
    name: 'Planner',
    href: 'https://planner.future.seta.vn',
    icon: '📋',
    color: 'linear-gradient(135deg,#0F766E,#14B8A6)',
  },
  {
    id: 'admin',
    name: 'Admin',
    href: 'https://admin.future.seta.vn',
    icon: '⚙',
    color: 'linear-gradient(135deg,#475569,#94A3B8)',
  },
]

// ─── Keyboard shortcut hint ──────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[3px] border border-white/15 bg-white/8 px-1.5 py-px font-mono text-[10px] text-white/40">
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
          'relative z-10 w-full max-w-[600px] mx-4',
          'rounded-xl border border-white/10',
          'bg-[rgba(17,24,39,0.96)] backdrop-blur-2xl',
          'shadow-2xl',
          'animate-in fade-in slide-in-from-top-2 duration-200',
          'overflow-hidden',
        )}
      >
        {/* Radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%,rgba(59,130,246,.12) 0%,transparent 60%)',
          }}
          aria-hidden="true"
        />

        {/* Search bar */}
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3.5">
          <Grid2X2 className="h-4 w-4 flex-shrink-0 text-white/40" aria-hidden="true" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-white/30"
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
        <div className="flex border-b border-white/8 px-4" role="tablist">
          {(['apps', 'search', 'recent'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-xs font-medium capitalize transition-all',
                'border-b-2 -mb-px',
                tab === t
                  ? 'border-blue-500 text-blue-300'
                  : 'border-transparent text-white/40 hover:text-white/70',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* App grid */}
        <div className="p-5">
          {displayApps.length === 0 ? (
            <p className="text-center text-xs text-white/30 py-8">
              {tab === 'recent' ? 'No recently visited apps.' : 'No apps found.'}
            </p>
          ) : (
            <>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {tab === 'recent' ? 'Recently visited' : 'Your apps'}
              </div>
              <div
                ref={gridRef}
                className="grid grid-cols-4 gap-2 max-[500px]:grid-cols-3"
                role="list"
              >
                {displayApps.map((app, idx) => {
                  const isCurrent = app.id === currentApp
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
                        'cursor-pointer text-decoration-none transition-all focus:outline-none',
                        'focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#111827]',
                        isCurrent
                          ? 'border-blue-500/35 bg-blue-500/15'
                          : 'border-transparent hover:border-white/10 hover:bg-white/6',
                      )}
                    >
                      {/* Icon */}
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-[10px] text-[22px] shadow-md flex-shrink-0"
                        style={{ background: app.color }}
                        aria-hidden="true"
                      >
                        {app.icon}
                      </div>

                      {/* Name */}
                      <span
                        className={cn(
                          'text-center text-[11px] font-medium leading-tight',
                          isCurrent ? 'text-blue-300' : 'text-white/75',
                        )}
                      >
                        {app.name}
                      </span>

                      {/* Current badge */}
                      {isCurrent && (
                        <span
                          className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-green-600 ring-[1.5px] ring-[#111827]"
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
        <div className="flex items-center justify-between border-t border-white/6 bg-black/20 px-4 py-2.5">
          <span className="text-[11px] text-white/35">
            {currentApp ? (
              <>
                Currently in:{' '}
                <strong className="text-white/60">
                  {apps.find((a) => a.id === currentApp)?.name ?? currentApp}
                </strong>
              </>
            ) : (
              'Future OS'
            )}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-white/30">
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
        'bg-[#1D4ED8] text-white text-xs font-bold',
        'transition-all hover:bg-[#2563EB] hover:scale-[1.06]',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={app ? `Currently in ${app.name} — click to switch app` : 'Switch app'}
      className={cn(
        'flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5',
        'text-[11px] font-medium text-slate-700',
        'transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
        'focus:outline-none focus:ring-2 focus:ring-blue-500',
        'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
        'dark:hover:border-blue-800 dark:hover:bg-blue-950 dark:hover:text-blue-400',
        className,
      )}
    >
      {app && (
        <span className="text-[13px]" aria-hidden="true">
          {app.icon}
        </span>
      )}
      <span>{app?.name ?? 'Apps'}</span>
      <ChevronDown className="h-2.5 w-2.5 text-slate-400" aria-hidden="true" />
    </button>
  )
}
