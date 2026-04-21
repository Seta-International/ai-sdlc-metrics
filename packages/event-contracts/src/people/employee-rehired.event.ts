export class EmployeeRehiredEvent {
  static readonly eventName = 'people.employee.rehired'
  constructor(
    public readonly tenantId: string,
    public readonly newProfileId: string,
    public readonly previousProfileId: string,
    public readonly newEmploymentId: string,
    public readonly actorId: string,
    public readonly rehireDate: Date,
    public readonly rehiredBy: string,
  ) {}
}
