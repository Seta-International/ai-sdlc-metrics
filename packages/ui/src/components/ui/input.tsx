import * as React from 'react'

import { cn } from '../../lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3.5 py-3 text-sm text-foreground shadow-none transition-[color,box-shadow] outline-none',
        'placeholder:text-muted-foreground',
        'selection:bg-primary selection:text-primary-foreground',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'dark:bg-[rgba(255,255,255,0.02)]',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_rgba(113,112,255,0.3),_0_0_0_3px_rgba(113,112,255,0.1)]',
        'aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_1px_rgba(239,68,68,0.3),_0_0_0_3px_rgba(239,68,68,0.1)]',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
