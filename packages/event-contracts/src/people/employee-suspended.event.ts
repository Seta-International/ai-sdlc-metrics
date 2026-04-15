export class EmployeeSuspendedEvent {
  static readonly eventName = 'people.employee-suspended'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly reason: string,
    public readonly reviewDate: Date,
  ) {}
}
