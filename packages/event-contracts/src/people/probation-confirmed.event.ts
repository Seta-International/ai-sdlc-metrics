export class ProbationConfirmedEvent {
  static readonly eventName = 'people.probation-confirmed'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly outcomeDate: Date,
  ) {}
}
