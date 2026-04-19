import { TaskDetailPanel } from './TaskDetailPanel'

interface Props {
  taskId: string
  planId: string
}

export function TaskDetailFullPage({ taskId, planId }: Props) {
  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      <TaskDetailPanel taskId={taskId} planId={planId} />
    </div>
  )
}
