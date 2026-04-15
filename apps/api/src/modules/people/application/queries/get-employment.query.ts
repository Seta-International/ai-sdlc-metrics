export class GetEmploymentQuery {
  constructor(
    readonly employmentId: string,
    readonly tenantId: string,
  ) {}
}
