import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap transition-[color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring/50',
  {
    variants: {
      variant: {
        // Neutral pill — default tag/filter chip
        default:
          'rounded-full border border-border bg-transparent px-2.5 py-0 text-xs font-510 text-secondary-foreground',
        // Success — green status pill
        success:
          'rounded-full border-transparent bg-emerald-500 px-2.5 py-0 text-xs font-510 text-foreground',
        // Subtle — inline label, version tag
        subtle:
          'rounded-sm border border-secondary/50 bg-secondary/50 px-2 py-0 text-xs font-510 text-foreground',
        // Status variants (use CSS vars from globals.css)
        destructive:
          'rounded-full border border-transparent bg-(--color-bg-danger) px-2.5 py-0 text-micro font-510 text-(--color-text-danger)',
        warning:
          'rounded-full border border-transparent bg-(--color-bg-warning) px-2.5 py-0 text-micro font-510 text-(--color-text-warning)',
        info: 'rounded-full border border-transparent bg-(--color-bg-info) px-2.5 py-0 text-micro font-510 text-(--color-text-info)',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
