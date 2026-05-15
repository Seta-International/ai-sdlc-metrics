import { ChevronRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '../../lib/cn'
import type { Variant } from '../../types'

const variantClass: Record<Variant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  neutral: 'bg-neutral',
}

interface Props {
  variant: Variant
  label: string
  expandable?: boolean
  children?: ReactNode
}

export function TimelineEvent({ variant, label, expandable, children }: Props) {
  const [open, setOpen] = useState(false)
  const canExpand = expandable && Boolean(children)
  return (
    <li className="relative pl-7">
      <span className={cn('absolute left-2 top-2 size-2 rounded-full', variantClass[variant])} />
      <button
        type="button"
        onClick={() => {
          if (canExpand) setOpen((o) => !o)
        }}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[14px]',
          canExpand && 'hover:bg-canvas-subtle cursor-pointer',
        )}
      >
        <span className="flex items-center gap-2">
          {canExpand && (
            <ChevronRight
              className={cn('size-3.5 stroke-[1.5] transition-transform', open && 'rotate-90')}
            />
          )}
          <span className="text-ink">{label}</span>
        </span>
      </button>
      {open && children && <div className="ml-5 mt-1">{children}</div>}
    </li>
  )
}
