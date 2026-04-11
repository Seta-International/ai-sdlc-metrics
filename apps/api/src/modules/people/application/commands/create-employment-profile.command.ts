export class CreateEmploymentProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly employeeCode: string,
    readonly companyEmail: string,
    readonly employmentType: 'permanent' | 'fixed_term' | 'contractor' | 'intern',
    readonly hireDate: Date,
    readonly jobTitle: string,
    readonly createdBy: string,
    readonly jobLevel?: string,
    readonly costCenter?: string,
    readonly workArrangement?: 'onsite' | 'hybrid' | 'remote',
  ) {}
}
