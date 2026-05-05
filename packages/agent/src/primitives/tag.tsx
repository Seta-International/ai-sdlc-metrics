import { cn } from '@future/ui'
import type { ReactNode } from 'react'

type Variant = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const variantClasses: Record<Variant, string> = {
  default: 'text-muted-foreground bg-white/[0.04] border-white/[0.06]',
  accent: 'text-accent bg-accent/[0.08] border-accent/20',
  success: 'text-emerald-400 bg-emerald-400/[0.08] border-emerald-400/20',
  warning: 'text-amber-400 bg-amber-400/[0.08] border-amber-400/20',
  danger: 'text-red-400 bg-red-400/[0.08] border-red-400/20',
}

export interface TagProps {
  children: ReactNode
  variant?: Variant
  className?: string
}

export function Tag({ children, variant = 'default', className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm border px-1.25 py-px',
        'font-mono text-xs font-semibold uppercase tracking-[0.02em]',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
