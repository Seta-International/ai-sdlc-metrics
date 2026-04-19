export interface TaskAssignedTemplateParams {
  taskId: string
  planId: string
  assignerName?: string
  taskTitle?: string
  planName?: string
  dueDate?: string
}

export function buildTaskAssignedNotification(params: TaskAssignedTemplateParams): {
  title: string
  body: string
  resourceUrl: string
} {
  const { taskId, planId, assignerName, taskTitle, planName, dueDate } = params

  const title = `${assignerName ?? 'A teammate'} assigned you to ${taskTitle ?? 'a task'}`

  const lines: string[] = []
  if (assignerName) lines.push(`Assigned by: ${assignerName}`)
  if (planName) lines.push(`Plan: ${planName}`)
  if (taskTitle) lines.push(`Task: ${taskTitle}`)
  if (dueDate) lines.push(`Due: ${dueDate}`)
  const resourceUrl = `/plans/${planId}/board/tasks/${taskId}`
  lines.push(`View: ${resourceUrl}`)

  return { title, body: lines.join('\n'), resourceUrl }
}
