import * as React from 'react'

import { cn } from '../../lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3.5 py-3 text-sm text-foreground shadow-none transition-[color,box-shadow] outline-none',
        'placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:bg-[rgba(255,255,255,0.02)]',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_rgba(113,112,255,0.3),_0_0_0_3px_rgba(113,112,255,0.1)]',
        'aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_1px_rgba(239,68,68,0.3),_0_0_0_3px_rgba(239,68,68,0.1)]',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
