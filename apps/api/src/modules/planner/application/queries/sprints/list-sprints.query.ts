import type { SprintRecord } from '../../../domain/repositories/sprint.repository'

export class ListSprintsQuery {
  constructor(
    public readonly planId: string,
    public readonly tenantId: string,
  ) {}
}

export interface ListSprintsResult {
  sprints: SprintRecord[]
}
