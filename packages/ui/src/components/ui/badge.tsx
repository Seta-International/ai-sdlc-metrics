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
          'rounded-full border border-[#23252a] bg-transparent px-[10px] py-0 text-[12px] font-[510] text-[#d0d6e0]',
        // Success — green status pill
        success:
          'rounded-full border-transparent bg-[#10b981] px-[10px] py-0 text-[10px] font-[510] text-[#f7f8f8]',
        // Subtle — inline label, version tag
        subtle:
          'rounded-[2px] border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.05)] px-2 py-0 text-[10px] font-[510] text-[#f7f8f8]',
        // Status variants (use CSS vars from globals.css)
        destructive:
          'rounded-full border border-transparent bg-(--color-bg-danger) px-[10px] py-0 text-[11px] font-medium text-(--color-text-danger)',
        warning:
          'rounded-full border border-transparent bg-(--color-bg-warning) px-[10px] py-0 text-[11px] font-medium text-(--color-text-warning)',
        info: 'rounded-full border border-transparent bg-(--color-bg-info) px-[10px] py-0 text-[11px] font-medium text-(--color-text-info)',
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
