'use client'

import { useSession } from '@future/auth'
import type { TaskDetailSnapshot } from '@/lib/board-types'
import { useTaskDetail } from '@/lib/hooks/useTaskDetail'
import { AssigneesField } from '../fields/AssigneesField'
import { PriorityField } from '../fields/PriorityField'
import { ProgressField } from '../fields/ProgressField'
import { DateField } from '../fields/DateField'
import { BucketField } from '../fields/BucketField'
import { LabelsField } from '../fields/LabelsField'
import { RichTextDescription } from '../fields/RichTextDescription'
import { CustomFieldsSection } from './custom-fields/CustomFieldsSection'

interface Props {
  taskId: string
  planId: string
  task: TaskDetailSnapshot
}

const LABEL = 'min-w-[5rem] shrink-0 text-xs text-fg-muted'

export function TaskDetailTab({ taskId, planId, task }: Props) {
  const { update } = useTaskDetail({ taskId, planId })
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  return (
    <div className="flex flex-col gap-0 py-2">
      {/* Assignees — full width */}
      <div className="flex items-start gap-3 px-4 py-1">
        <span className={LABEL}>Assignees</span>
        <div className="flex-1">
          <AssigneesField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Priority + Progress — compact pair */}
      <div className="grid grid-cols-2 px-4 py-1">
        <div className="flex items-center gap-2">
          <span className={LABEL}>Priority</span>
          <PriorityField taskId={taskId} planId={planId} task={task} />
        </div>
        <div className="flex items-center gap-2">
          <span className={LABEL}>Progress</span>
          <ProgressField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Start + Due dates — compact pair */}
      <div className="grid grid-cols-2 px-4 py-1">
        <div className="flex items-center gap-2">
          <span className={LABEL}>Start</span>
          <DateField kind="start" taskId={taskId} planId={planId} task={task} />
        </div>
        <div className="flex items-center gap-2">
          <span className={LABEL}>Due</span>
          <DateField kind="due" taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Bucket — full width */}
      <div className="flex items-center gap-3 px-4 py-1">
        <span className={LABEL}>Bucket</span>
        <div className="flex-1">
          <BucketField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Labels — full width */}
      <div className="flex items-start gap-3 px-4 py-1">
        <span className={LABEL}>Labels</span>
        <div className="flex-1">
          <LabelsField taskId={taskId} planId={planId} task={task} />
        </div>
      </div>

      {/* Description */}
      <div className="mt-2 px-4 py-1">
        <h3 className="mb-2 text-xs font-510 text-fg-muted">Description</h3>
        <RichTextDescription
          value={task.description}
          onChange={(html) => update({ description: html })}
        />
      </div>

      {/* Custom Fields */}
      {task.customFields && task.customFields.length > 0 && (
        <CustomFieldsSection
          fields={task.customFields}
          taskId={taskId}
          planId={planId}
          tenantId={tenantId}
          actorId={actorId}
        />
      )}
    </div>
  )
}
