'use client'

import * as React from 'react'

interface SideCardProps {
  title: string
  count?: number
  children: React.ReactNode
}

export function SideCard({ title, count, children }: SideCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <h4 className="text-xs font-510 uppercase tracking-widest text-muted-foreground">
          {title}
        </h4>
        {count != null && <span className="text-xs text-muted-foreground">{count}</span>}
      </header>
      {children}
    </section>
  )
}
