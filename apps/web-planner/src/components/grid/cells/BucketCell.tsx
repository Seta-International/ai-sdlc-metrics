import type { TaskFlat } from '@future/api-client/planner'
import { PersonalPlanBadge } from '../../personal-plan-badge'

export function BucketCell({ task }: { task: TaskFlat }) {
  const withPlan = task as TaskFlat & { planName?: string; planKind?: 'team' | 'personal' }
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm truncate">{task.bucketName}</span>
      {withPlan.planName ? (
        <PersonalPlanBadge planName={withPlan.planName} planKind={withPlan.planKind ?? 'team'} />
      ) : null}
    </div>
  )
}
