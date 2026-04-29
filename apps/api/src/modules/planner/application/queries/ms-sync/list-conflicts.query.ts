export interface ListConflictsOptions {
  resolved: 'open' | 'all'
  limit: number
  cursor?: string
}

export class ListConflictsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly opts: ListConflictsOptions,
  ) {}
}
