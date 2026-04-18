export class UpdateTaskCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly expectedVersion: string,
    public readonly title?: string,
    public readonly description?: string,
    public readonly progress?: 0 | 50 | 100,
    public readonly priority?: 1 | 3 | 5 | 9,
    public readonly startDate?: Date | null,
    public readonly dueDate?: Date | null,
  ) {}
}
