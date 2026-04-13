import type { JobStatus } from '../../domain/value-objects/job-status.vo'

export class ListGenerationJobsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly filters?: { status?: JobStatus; limit?: number; offset?: number },
  ) {}
}
