export class TaskSprintAssignedEvent {
  static readonly eventName = 'planner.task-sprint-assigned'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly planId: string,
    /** null means unassigned from sprint */
    public readonly sprintId: string | null,
    public readonly sprintName?: string | null,
  ) {}
}
