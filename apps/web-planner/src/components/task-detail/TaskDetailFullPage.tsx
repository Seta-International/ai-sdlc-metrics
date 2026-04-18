interface Props {
  taskId: string
  planId: string
}
export function TaskDetailFullPage({ taskId, planId }: Props) {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Task Detail</h1>
      <p className="text-sm text-neutral-500">
        Task {taskId} in plan {planId}
      </p>
    </div>
  )
}
