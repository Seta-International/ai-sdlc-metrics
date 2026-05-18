import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const card = cva('rounded-lg border', {
  variants: {
    variant: {
      default: 'bg-canvas border-hairline shadow-card p-6 text-ink',
      inset: 'bg-canvas-soft border-hairline p-4 text-ink',
      dark: 'bg-sidebar-bg border-transparent p-6 text-on-sidebar',
    },
  },
  defaultVariants: { variant: 'default' },
})

interface Props extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, Props>(({ className, variant, ...rest }, ref) => (
  <div ref={ref} className={cn(card({ variant }), className)} {...rest} />
))
Card.displayName = 'Card'
