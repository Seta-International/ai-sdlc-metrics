export class ChecklistLimitReachedException extends Error {
  constructor(taskId: string, max = 20) {
    super(`Checklist limit (${max}) reached for task: ${taskId}`)
    this.name = 'ChecklistLimitReachedException'
  }
}
