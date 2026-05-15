import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Icon className="size-6 stroke-[1.5] text-ink-subtle" />
      <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h2>
      {description && <p className="max-w-sm text-[14px] text-ink-mute">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
