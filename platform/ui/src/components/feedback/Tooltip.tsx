import * as R from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export const TooltipProvider = ({
  children,
  delayDuration = 200,
}: {
  children: ReactNode
  delayDuration?: number
}) => <R.Provider delayDuration={delayDuration}>{children}</R.Provider>

interface Props {
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactNode
}

export function Tooltip({ content, side = 'top', children }: Props) {
  return (
    <R.Root>
      <R.Trigger asChild>{children}</R.Trigger>
      <R.Portal>
        <R.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 rounded-md bg-ink px-2 py-1 text-[12px] text-on-primary shadow-float',
            'animate-in fade-in-0',
          )}
        >
          {content}
          <R.Arrow className="fill-ink" />
        </R.Content>
      </R.Portal>
    </R.Root>
  )
}
