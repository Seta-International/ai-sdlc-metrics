import type { TaskFlat } from '@future/api-client/planner'

export function BucketCell({ task }: { task: TaskFlat }) {
  return <span className="text-muted-foreground text-sm">{task.bucketName}</span>
}
