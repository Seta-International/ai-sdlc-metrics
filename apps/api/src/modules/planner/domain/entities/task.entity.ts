export class Task {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly planId: string,
    readonly bucketId: string,
    readonly title: string,
    readonly description: string,
    readonly progress: number,
    readonly priority: number,
    readonly orderHint: string,
    readonly createdBy: string,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly completedBy: string | null,
    readonly completedAt: Date | null,
    readonly deletedAt: Date | null,
  ) {}

  static reconstitute(props: {
    id: string
    tenantId: string
    planId: string
    bucketId: string
    title: string
    description: string
    progress: number
    priority: number
    orderHint: string
    createdBy: string
    createdAt: Date
    updatedAt: Date
    completedBy: string | null
    completedAt: Date | null
    deletedAt: Date | null
  }): Task {
    return new Task(
      props.id,
      props.tenantId,
      props.planId,
      props.bucketId,
      props.title,
      props.description,
      props.progress,
      props.priority,
      props.orderHint,
      props.createdBy,
      props.createdAt,
      props.updatedAt,
      props.completedBy,
      props.completedAt,
      props.deletedAt,
    )
  }
}
