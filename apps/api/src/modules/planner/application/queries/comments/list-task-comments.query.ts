export class ListTaskCommentsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly cursor: string | undefined,
    public readonly limit: number,
  ) {}
}

export interface TaskCommentDto {
  id: string
  taskId: string
  tenantId: string
  authorActorId: string
  body: string
  postedAt: Date
  deleted: boolean
}
