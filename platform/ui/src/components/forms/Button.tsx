import { cva, type VariantProps } from 'class-variance-authority'
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium select-none ' +
    'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-focus ' +
    'disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-focus',
        secondary: 'bg-canvas text-ink border border-hairline-strong hover:bg-canvas-subtle',
        ghost: 'bg-transparent text-ink-mute hover:bg-canvas-subtle',
        onDark: 'bg-white/10 text-on-sidebar border border-white/10 hover:bg-white/15',
      },
      size: {
        md: 'h-9 px-3.5 text-[14px]',
        sm: 'h-8 px-2.5 text-[13px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, icon, children, ...rest }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...rest}>
      {icon}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
