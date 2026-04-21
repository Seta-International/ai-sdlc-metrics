export class RehireEmploymentCommand {
  constructor(
    public readonly tenantId: string,
    public readonly previousProfileId: string,
    public readonly actorId: string,
    public readonly rehireDate: Date,
    public readonly workerType: 'employee' | 'contingent',
    public readonly employmentType: 'permanent' | 'fixed_term' | 'intern',
    public readonly countryCode: string,
    public readonly jobTitle: string | null,
    public readonly departmentId: string | null,
    public readonly managerProfileId: string | null,
    public readonly rehiredBy: string,
  ) {}
}
