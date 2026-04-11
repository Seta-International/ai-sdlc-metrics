export class CompleteTaskCommand {
  constructor(
    readonly tenantId: string,
    readonly taskId: string,
    readonly taskType: 'onboarding' | 'offboarding',
    readonly completedBy: string,
    readonly evidenceUrl: string | null,
  ) {}
}
