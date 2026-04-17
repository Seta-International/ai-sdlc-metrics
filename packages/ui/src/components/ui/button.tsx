import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '../../lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-xs whitespace-nowrap transition-all duration-100 outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Ghost button — default interactive element
        default:
          'border border-(--btn-ghost-border) bg-(--btn-ghost-bg) text-foreground font-510 hover:bg-(--btn-ghost-bg-hover) focus-visible:ring-3 focus-visible:ring-ring/50',
        // Primary CTA — brand indigo, use sparingly
        primary:
          'bg-primary text-primary-foreground font-510 hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/50',
        // Subtle — toolbar actions, slightly visible bg
        secondary:
          'bg-(--btn-subtle-bg) text-foreground font-510 hover:bg-(--btn-subtle-bg-hover) focus-visible:ring-3 focus-visible:ring-ring/50',
        // Outline — explicit border, transparent bg
        outline:
          'border border-border bg-transparent text-foreground font-510 hover:bg-(--btn-ghost-bg) focus-visible:ring-3 focus-visible:ring-ring/50',
        // Ghost — no border, no bg
        ghost:
          'text-muted-foreground font-510 hover:bg-(--btn-ghost-bg) hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        // Destructive
        destructive:
          'bg-destructive text-white font-510 hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-destructive/50',
        // Icon — circular icon button
        icon: 'rounded-full border border-(--btn-ghost-border) bg-secondary/75 text-foreground hover:bg-(--btn-ghost-bg-hover) focus-visible:ring-3 focus-visible:ring-ring/50',
        // Link
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 py-2 has-[>svg]:px-2.5',
        xs: "h-6 gap-1 rounded-md px-2 text-micro has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-7 gap-1.5 rounded-md px-2 py-1 text-micro has-[>svg]:px-1.5',
        lg: 'h-10 rounded-md px-5 py-3 text-sm has-[>svg]:px-4',
        icon: 'size-8',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
