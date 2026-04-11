export class CreateEmploymentProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly employeeCode: string | null,
    readonly companyEmail: string | null,
    readonly employmentType: 'permanent' | 'fixed_term' | 'contractor' | 'intern',
    readonly hireDate: Date,
    readonly jobTitle: string | null,
    readonly createdBy: string,
    readonly jobLevel?: string,
    readonly costCenter?: string,
    readonly workArrangement?: 'onsite' | 'hybrid' | 'remote',
  ) {}
}
