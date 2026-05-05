import { cn } from '@future/ui'
import type { ReactNode } from 'react'

export interface MonoProps {
  children: ReactNode
  className?: string
}

export function Mono({ children, className }: MonoProps) {
  return (
    <span className={cn('font-mono text-xs text-muted-foreground', className)}>{children}</span>
  )
}
