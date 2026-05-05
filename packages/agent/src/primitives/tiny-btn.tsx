import { cn } from '@future/ui'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface TinyBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  active?: boolean
  danger?: boolean
}

export function TinyBtn({ children, active, danger, className, ...rest }: TinyBtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-5.5 items-center gap-1 rounded border border-white/[0.07] px-1.75',
        'font-medium text-xs transition-colors',
        active ? 'bg-white/[0.06] text-foreground' : 'bg-transparent text-muted-foreground',
        danger && 'text-red-400 hover:text-red-300',
        'disabled:opacity-50 disabled:pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  )
}
