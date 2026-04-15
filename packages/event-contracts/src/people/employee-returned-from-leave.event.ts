export class EmployeeReturnedFromLeaveEvent {
  static readonly eventName = 'people.employee-returned-from-leave'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actualReturnDate: Date,
  ) {}
}
