export interface ListTasksForActorOptions {
  includeCompleted: boolean
}

export class ListTasksForActorQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly options: ListTasksForActorOptions,
  ) {}
}
