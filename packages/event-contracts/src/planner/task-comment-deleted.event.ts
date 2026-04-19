/** No consumer in Phase 1 — reserved for Phase 4 sync + future subscribers. */
export class TaskCommentDeletedEvent {
  static readonly eventName = 'planner.task-comment-deleted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly commentId: string,
  ) {}
}
