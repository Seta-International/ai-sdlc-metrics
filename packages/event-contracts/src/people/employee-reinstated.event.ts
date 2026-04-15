export class EmployeeReinstatedEvent {
  static readonly eventName = 'people.employee-reinstated'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly reason: string,
  ) {}
}
