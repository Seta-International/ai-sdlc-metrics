export class GetGenerationJobQuery {
  constructor(
    public readonly tenantId: string,
    public readonly jobId: string,
  ) {}
}
