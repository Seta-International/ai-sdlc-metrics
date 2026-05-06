'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from '@future/ui/icons'
import { IterationHeader } from './iteration-header'

export interface IterationGroupItem {
  n: number
  summary: string
}

export interface IterationGroupProps<T extends IterationGroupItem> {
  iterations: T[]
  children: (iteration: T, expanded: boolean) => ReactNode
}

export function IterationGroup<T extends IterationGroupItem>({
  iterations,
  children,
}: IterationGroupProps<T>) {
  const total = iterations.length
  const lastN = iterations[total - 1]?.n ?? 1
  const [expandedNs, setExpandedNs] = useState<Set<number>>(new Set([lastN]))

  const toggle = (n: number) =>
    setExpandedNs((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  return (
    <div className="flex flex-col gap-1">
      <IterationHeader current={lastN} total={total} />
      {iterations.map((iter) => {
        const expanded = expandedNs.has(iter.n)
        if (expanded) {
          return (
            <div key={iter.n} className="rounded-md border border-white/[0.05] p-2">
              {children(iter, true)}
            </div>
          )
        }
        return (
          <button
            type="button"
            key={iter.n}
            onClick={() => toggle(iter.n)}
            className="flex w-full items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.01] px-2 py-1 text-left hover:bg-white/[0.02]"
          >
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/70" />
            <span className="font-mono text-[0.625rem] text-muted-foreground/70">
              iter {iter.n}
            </span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">
              {iter.summary.slice(0, 80)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
