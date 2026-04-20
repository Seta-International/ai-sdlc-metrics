export type FilterMode = 'plan' | 'personal'

export type FilterField =
  | 'due'
  | 'priority'
  | 'labels'
  | 'buckets'
  | 'assignees'
  | 'includeCompleted'

export interface PlanLabel {
  id: string
  name: string
  color: string
}

export interface PlanMember {
  actorId: string
  name?: string
  avatarUrl?: string
}

export interface PlanBucket {
  id: string
  name: string
}

export interface PlanContext {
  labels: PlanLabel[]
  members: PlanMember[]
  buckets: PlanBucket[]
}
