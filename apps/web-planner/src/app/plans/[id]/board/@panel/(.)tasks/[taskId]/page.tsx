import { TaskDetailPanel } from '@/components/task-detail/TaskDetailPanel'

interface Props {
  params: Promise<{ id: string; taskId: string }>
}

export default async function PanelPage({ params }: Props) {
  const { id, taskId } = await params
  return <TaskDetailPanel taskId={taskId} planId={id} />
}
