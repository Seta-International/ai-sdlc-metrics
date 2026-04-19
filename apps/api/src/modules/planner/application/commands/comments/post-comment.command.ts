export class PostCommentCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly commentId: string,
    public readonly actorId: string,
    public readonly body: string,
  ) {}
}
