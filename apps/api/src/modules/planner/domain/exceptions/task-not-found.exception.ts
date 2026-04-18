export class TaskNotFoundException extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`)
    this.name = 'TaskNotFoundException'
  }
}
