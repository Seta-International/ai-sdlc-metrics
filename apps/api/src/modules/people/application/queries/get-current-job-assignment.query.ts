export class GetCurrentJobAssignmentQuery {
  constructor(
    readonly employmentId: string,
    readonly tenantId: string,
  ) {}
}
