export class GetProjectQuery {
  constructor(
    readonly projectId: string,
    readonly tenantId: string,
  ) {}
}
