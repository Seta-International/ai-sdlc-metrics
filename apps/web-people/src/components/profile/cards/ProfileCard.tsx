'use client'

import * as React from 'react'
import { Button } from '@future/ui'
import { Shield } from '@future/ui/icons'

interface ProfileCardAction {
  label: string
  onClick: () => void
}

interface ProfileCardProps {
  title: string
  action?: ProfileCardAction
  locked?: boolean
  children: React.ReactNode
}

export function ProfileCard({ title, action, locked, children }: ProfileCardProps) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <h3 className="flex items-center gap-1.5 text-xs font-510 tracking-tight text-foreground">
          {locked && <Shield data-testid="lock-icon" className="h-3 w-3 text-muted-foreground" />}
          {title}
        </h3>
        {action && (
          <Button
            variant="ghost"
            size="sm"
            onClick={action.onClick}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {action.label}
          </Button>
        )}
      </header>
      <div className="px-3.5 pb-2.5 pt-1">{children}</div>
    </section>
  )
}

interface KVRowProps {
  label: string
  value: string | null | undefined
  mono?: boolean
}

export function KVRow({ label, value, mono }: KVRowProps) {
  return (
    <div
      className="grid border-b border-border/40 py-1.5 last:border-0"
      style={{ gridTemplateColumns: '160px 1fr' }}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs text-secondary-foreground ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}
