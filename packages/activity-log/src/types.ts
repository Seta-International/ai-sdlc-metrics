export interface ActivityEntry {
  tenantId: string
  actorId: string
  actorName: string
  action: string
  resourceType: string
  resourceId: string
  summary: string
  metadata?: Record<string, unknown>
  timestamp?: Date
}

export interface QueryOpts {
  from?: Date
  to?: Date
  limit?: number
  cursor?: string
}

export interface PaginatedResult<T> {
  items: T[]
  cursor?: string
}

export interface ActivityLogClient {
  write(entry: ActivityEntry): Promise<void>
  writeBatch(entries: ActivityEntry[]): Promise<void>
  queryByTenant(tenantId: string, opts?: QueryOpts): Promise<PaginatedResult<ActivityEntry>>
  queryByActor(
    tenantId: string,
    actorId: string,
    opts?: QueryOpts,
  ): Promise<PaginatedResult<ActivityEntry>>
  queryByResource(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    opts?: QueryOpts,
  ): Promise<PaginatedResult<ActivityEntry>>
}

export interface ActivityLogConfig {
  tableName: string
  region: string
  ttlDays?: number
}
