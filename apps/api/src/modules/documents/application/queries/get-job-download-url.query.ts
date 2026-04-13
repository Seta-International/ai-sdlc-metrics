export class GetJobDownloadUrlQuery {
  constructor(
    public readonly tenantId: string,
    public readonly jobId: string,
  ) {}
}
