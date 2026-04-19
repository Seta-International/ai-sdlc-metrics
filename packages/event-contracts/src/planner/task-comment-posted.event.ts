/** No consumer in Phase 1 — reserved for Phase 4 sync + future subscribers. */
export class TaskCommentPostedEvent {
  static readonly eventName = 'planner.task-comment-posted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly commentId: string,
    public readonly body: string,
  ) {}
}
