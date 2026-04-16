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
        'dark:bg-card',
        'focus-visible:outline-none focus-visible:shadow-none ring-1 ring-accent/30',
        'aria-invalid:border-destructive aria-invalid:shadow-none ring-1 ring-red-500/30',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
