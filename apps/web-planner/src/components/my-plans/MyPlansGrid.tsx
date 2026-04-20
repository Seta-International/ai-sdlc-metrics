import { PlanCard, type PlanCardData } from './PlanCard'
import type { PersonalPlanSummary } from '../../lib/hooks/usePersonalPlans'

export interface MyPlansGridProps {
  plans: PersonalPlanSummary[]
  actorId: string
}

export function MyPlansGrid({ plans, actorId }: MyPlansGridProps) {
  const decorated: PlanCardData[] = plans.map((p) => ({
    ...p,
    isPersonal: p.ownerActorId === actorId,
  }))

  const personal = decorated.filter((p) => p.isPersonal)
  const team = decorated.filter((p) => !p.isPersonal).sort((a, b) => a.name.localeCompare(b.name))

  const ordered = [...personal, ...team]

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="my-plans-grid"
    >
      {ordered.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  )
}
