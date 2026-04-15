export class GetProbationRecordQuery {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
  ) {}
}
