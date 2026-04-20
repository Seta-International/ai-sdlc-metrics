import { User } from 'lucide-react'

export function PersonalPlanBadge() {
  return (
    <span
      data-testid="personal-plan-badge"
      className="inline-flex items-center gap-1 rounded-full bg-elevated px-2 py-0.5 text-tiny font-510 text-fg-muted"
    >
      <User size={10} aria-hidden />
      Personal
    </span>
  )
}
