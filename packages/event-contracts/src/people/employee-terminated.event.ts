export class EmployeeTerminatedEvent {
  static readonly eventName = 'people.employee-terminated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly terminationDate: string,
  ) {}
}
