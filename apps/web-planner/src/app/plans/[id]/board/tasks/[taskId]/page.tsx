import { TaskDetailFullPage } from '@/components/task-detail/TaskDetailFullPage'

interface Props {
  params: Promise<{ id: string; taskId: string }>
}

export default async function TaskDetailPage({ params }: Props) {
  const { id, taskId } = await params
  return <TaskDetailFullPage taskId={taskId} planId={id} />
}
