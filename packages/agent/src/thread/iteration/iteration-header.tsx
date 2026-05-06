import { Repeat } from '@future/ui/icons'

export interface IterationHeaderProps {
  current: number
  total: number
}

export function IterationHeader({ current, total }: IterationHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-accent">
      <Repeat className="h-2.5 w-2.5" />
      iter {current}
      {total > 1 && <span className="text-muted-foreground/70"> of {total}</span>}
    </div>
  )
}
