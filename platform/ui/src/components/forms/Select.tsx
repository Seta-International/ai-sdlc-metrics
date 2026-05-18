import * as R from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const Root = R.Root

const Trigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof R.Trigger> & { placeholder?: string }
>(({ className, placeholder, ...rest }, ref) => (
  <R.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border',
      'border-hairline-strong bg-canvas px-3 text-[14px] text-ink',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-focus',
      className,
    )}
    {...rest}
  >
    <R.Value placeholder={placeholder} />
    <R.Icon>
      <ChevronDown className="size-4 stroke-[1.5]" />
    </R.Icon>
  </R.Trigger>
))
Trigger.displayName = 'SelectTrigger'

const Content = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof R.Content>>(
  ({ className, children, ...rest }, ref) => (
    <R.Portal>
      <R.Content
        ref={ref}
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden',
          'rounded-md border border-hairline bg-canvas shadow-float',
          className,
        )}
        {...rest}
      >
        <R.Viewport className="p-1">{children}</R.Viewport>
      </R.Content>
    </R.Portal>
  ),
)
Content.displayName = 'SelectContent'

interface ItemProps extends ComponentPropsWithoutRef<typeof R.Item> {
  children: ReactNode
}
const Item = forwardRef<HTMLDivElement, ItemProps>(({ className, children, ...rest }, ref) => (
  <R.Item
    ref={ref}
    className={cn(
      'relative flex h-8 cursor-default select-none items-center rounded-sm pl-7 pr-2',
      'text-[14px] text-ink outline-none focus:bg-canvas-subtle data-[disabled]:opacity-50',
      className,
    )}
    {...rest}
  >
    <span className="absolute left-2 inline-flex size-3.5 items-center justify-center">
      <R.ItemIndicator>
        <Check className="size-3.5 stroke-[1.5]" />
      </R.ItemIndicator>
    </span>
    <R.ItemText>{children}</R.ItemText>
  </R.Item>
))
Item.displayName = 'SelectItem'

export const Select = { Root, Trigger, Content, Item }
