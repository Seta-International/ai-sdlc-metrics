export class Task {
  constructor(
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
}
