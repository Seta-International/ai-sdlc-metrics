export class TaskAssignee {
  private constructor(
    readonly actorId: string,
    readonly assignedBy: string,
    readonly assignedAt: Date,
  ) {}

  static create(actorId: string, assignedBy: string, assignedAt?: Date): TaskAssignee {
    return new TaskAssignee(actorId, assignedBy, assignedAt ?? new Date())
  }

  equals(other: TaskAssignee): boolean {
    return this.actorId === other.actorId
  }
}
