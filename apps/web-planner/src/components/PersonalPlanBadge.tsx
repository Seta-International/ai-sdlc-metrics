import { Folder, User } from '@future/ui/icons'
import { Badge } from '@future/ui'

export function PersonalPlanBadge({
  planName,
  planKind,
}: {
  planName: string
  planKind: 'team' | 'personal'
}) {
  const Icon = planKind === 'personal' ? User : Folder
  const label = planKind === 'personal' ? 'Personal plan' : 'Team plan'
  return (
    <Badge variant="subtle" className="gap-1" aria-label={label}>
      <Icon className="size-3" aria-hidden={true} />
      <span className="max-w-24 truncate">{planName}</span>
    </Badge>
  )
}
