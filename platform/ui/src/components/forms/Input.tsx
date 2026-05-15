import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border bg-canvas px-3 text-[14px] text-ink',
        'placeholder:text-ink-subtle',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-focus',
        invalid ? 'border-error' : 'border-hairline-strong',
        className,
      )}
      {...rest}
    />
  ),
)
Input.displayName = 'Input'
