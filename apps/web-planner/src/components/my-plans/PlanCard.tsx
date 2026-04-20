import Link from 'next/link'
import { Users } from 'lucide-react'
import { Card } from '@future/ui'
import { PersonalPlanBadge } from '../PersonalPlanBadge'

export interface PlanCardData {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: string
  ownerActorId: string | null
  isPersonal: boolean
}

export function PlanCard({ plan }: { plan: PlanCardData }) {
  return (
    <Link href={`/plans/${plan.id}/board`} className="block transition-opacity hover:opacity-90">
      <Card className="cursor-pointer p-4 transition-colors hover:bg-elevated">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate text-sm font-510 text-fg-primary">{plan.name}</h2>
          {plan.isPersonal && <PersonalPlanBadge />}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
          <Users size={12} />
          <span>{plan.memberCount}</span>
          {plan.myRole && <span className="ml-1 capitalize text-fg-subtle">{plan.myRole}</span>}
        </div>
      </Card>
    </Link>
  )
}
