import { cn } from '@future/ui'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  'aria-label': string
}

export function IconBtn({ children, className, ...rest }: IconBtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md',
        'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
        'transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  )
}
