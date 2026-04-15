export class ProbationEndingEvent {
  static readonly eventName = 'people.probation-ending'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly currentEndDate: Date,
    public readonly daysRemaining: number,
  ) {}
}
