'use client'

import { Badge, Button, Separator } from '@future/ui'
import { AssigneeAvatarStack } from '../primitives/AssigneeAvatarStack'
import { PriorityIcon, type Priority } from '../primitives/PriorityIcon'

interface Assignee {
  actorId: string
  name?: string
}

interface PlanLabel {
  slot: string
  name: string
  color: string
}

interface Props {
  bucketName: string
  progress: 0 | 50 | 100
  priority: Priority
  appliedLabels: string[]
  planLabels: PlanLabel[]
  assignees: Assignee[]
  startDate: Date | null
  dueDate: Date | null
}

const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Low',
  3: 'Normal',
  5: 'Important',
  9: 'Urgent',
}

const PROGRESS_VARIANT: Record<0 | 50 | 100, 'default' | 'warning' | 'success'> = {
  0: 'default',
  50: 'warning',
  100: 'success',
}

const PROGRESS_LABEL: Record<0 | 50 | 100, string> = {
  0: 'Not started',
  50: 'In progress',
  100: 'Complete',
}

function formatDate(date: Date | null): string {
  if (!date) return 'Not set'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const PROPERTY_LABEL_CLASS = 'min-w-[4.5rem] text-xs text-fg-muted'

export function TaskPropertyStrip({
  bucketName,
  progress,
  priority,
  appliedLabels,
  planLabels,
  assignees,
  startDate,
  dueDate,
}: Props) {
  const resolvedLabels = appliedLabels
    .map((slot) => planLabels.find((l) => l.slot === slot))
    .filter(Boolean) as PlanLabel[]

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className={PROPERTY_LABEL_CLASS}>Bucket</span>
        <Badge variant="default">{bucketName}</Badge>
        <span className={PROPERTY_LABEL_CLASS}>Progress</span>
        <Badge variant={PROGRESS_VARIANT[progress]}>{PROGRESS_LABEL[progress]}</Badge>
      </div>

      <Separator />

      <div className="flex items-center gap-3 px-4 py-2">
        <span className={PROPERTY_LABEL_CLASS}>Assignees</span>
        <AssigneeAvatarStack assignees={assignees} />
        <Button variant="ghost" size="xs">
          + Add
        </Button>
      </div>

      <Separator />

      <div className="flex items-center gap-3 px-4 py-2">
        <span className={PROPERTY_LABEL_CLASS}>Priority</span>
        <span className="flex items-center gap-1 text-xs">
          <PriorityIcon priority={priority} />
          {PRIORITY_LABEL[priority]}
        </span>
        <span className={PROPERTY_LABEL_CLASS}>Labels</span>
        <div className="flex flex-wrap items-center gap-1">
          {resolvedLabels.length === 0 ? (
            <span className="text-xs text-fg-muted">None</span>
          ) : (
            resolvedLabels.map((label) => (
              <Badge key={label.slot} variant="subtle">
                {label.name}
              </Badge>
            ))
          )}
        </div>
      </div>

      <Separator />

      <div className="flex items-center gap-3 px-4 py-2">
        <span className={PROPERTY_LABEL_CLASS}>Start</span>
        <span className="text-xs">{formatDate(startDate)}</span>
        <span className={PROPERTY_LABEL_CLASS}>Due</span>
        <span className="text-xs">{formatDate(dueDate)}</span>
      </div>
    </div>
  )
}
