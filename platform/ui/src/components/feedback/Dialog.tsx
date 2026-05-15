import * as R from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../../lib/cn'

const Root = R.Root
const Trigger = R.Trigger
const Title = R.Title
const Description = R.Description
const Close = R.Close

const Content = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof R.Content>>(
  ({ className, children, ...rest }, ref) => (
    <R.Portal>
      <R.Overlay className="fixed inset-0 z-40 bg-[var(--color-overlay)] animate-in fade-in-0" />
      <R.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-hairline bg-canvas p-6 shadow-float',
          'animate-in fade-in-0 zoom-in-95',
          className,
        )}
        {...rest}
      >
        {children}
        <R.Close
          className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-ink-mute hover:bg-canvas-subtle"
          aria-label="Close"
        >
          <X className="size-4 stroke-[1.5]" />
        </R.Close>
      </R.Content>
    </R.Portal>
  ),
)
Content.displayName = 'DialogContent'

export const Dialog = { Root, Trigger, Content, Title, Description, Close }
