import { useEffect } from 'react'
import { cn } from '../../lib/cn'
import type { Variant } from '../../types'

const variantClass: Record<Variant, string> = {
  success: 'border-success/30 bg-success-soft text-success',
  error: 'border-error/30 bg-error-soft text-error',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  info: 'border-info/30 bg-info-soft text-info',
  neutral: 'border-hairline bg-canvas-subtle text-ink-mute',
}

interface Props {
  title: string
  description?: string
  variant?: Variant
  duration?: number
  onDismiss: () => void
}

export function Toast({ title, description, variant = 'info', duration = 4000, onDismiss }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(t)
  }, [duration, onDismiss])
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto rounded-lg border bg-canvas p-3 shadow-card',
        variantClass[variant],
      )}
    >
      <div className="text-[14px] font-medium text-ink">{title}</div>
      {description && <div className="mt-0.5 text-[12px] text-ink-mute">{description}</div>}
    </div>
  )
}
