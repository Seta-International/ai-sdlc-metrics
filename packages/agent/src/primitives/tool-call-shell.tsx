'use client'

import { cn } from '@future/ui'
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Check, RefreshCw, AlertTriangle } from '@future/ui/icons'

export type ToolCallStatus = 'running' | 'done' | 'error'

const statusConfig: Record<ToolCallStatus, { icon: ReactNode; color: string }> = {
  running: { icon: <RefreshCw className="h-3 w-3 animate-spin" />, color: 'text-accent' },
  done: { icon: <Check className="h-3 w-3" />, color: 'text-emerald-400' },
  error: { icon: <AlertTriangle className="h-3 w-3" />, color: 'text-red-400' },
}

export interface ToolCallShellProps {
  header: ReactNode
  status: ToolCallStatus
  defaultOpen?: boolean
  children?: ReactNode
}

export function ToolCallShell({
  header,
  status,
  defaultOpen = false,
  children,
}: ToolCallShellProps) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = statusConfig[status]
  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-white/[0.02]"
      >
        <span className="text-muted-foreground/70">
          {open ? (
            <ChevronDown className="h-2.5 w-2.5" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5" />
          )}
        </span>
        <span className={cn('inline-flex', cfg.color)}>{cfg.icon}</span>
        <div className="min-w-0 flex-1">{header}</div>
      </button>
      {open && children && (
        <div className="flex flex-col gap-1.5 border-t border-white/[0.06] p-2">{children}</div>
      )}
    </div>
  )
}
