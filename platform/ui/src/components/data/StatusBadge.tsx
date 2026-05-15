import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { Variant } from '../../types'

const map: Record<Variant, string> = {
  success: 'text-success bg-success-soft',
  warning: 'text-warning bg-warning-soft',
  error: 'text-error bg-error-soft',
  info: 'text-info bg-info-soft',
  neutral: 'text-neutral bg-neutral-soft',
}

interface Props {
  variant: Variant
  children: ReactNode
  className?: string
}

export function StatusBadge({ variant, children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium tracking-wider uppercase',
        map[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
