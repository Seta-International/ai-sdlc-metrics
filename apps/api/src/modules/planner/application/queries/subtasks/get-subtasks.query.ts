export interface SubtaskItem {
  id: string
  title: string
  progress: number
  orderHint: string
}

export interface GetSubtasksResult {
  subtasks: SubtaskItem[]
}

export class GetSubtasksQuery {
  constructor(
    public readonly parentTaskId: string,
    public readonly planId: string,
    public readonly tenantId: string,
  ) {}
}
