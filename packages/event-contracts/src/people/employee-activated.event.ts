export class EmployeeActivatedEvent {
  static readonly eventName = 'people.employee-activated'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly employeeCode: string,
    public readonly companyEmail: string,
  ) {}
}
