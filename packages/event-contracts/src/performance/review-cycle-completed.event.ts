export class ReviewCycleCompletedEvent {
  static readonly eventName = 'performance.review-cycle-completed'
  constructor(
    public readonly tenantId: string,
    public readonly cycleId: string,
    public readonly completedAt: string,
  ) {}
}
