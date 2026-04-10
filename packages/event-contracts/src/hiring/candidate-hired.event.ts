export class CandidateHiredEvent {
  static readonly eventName = 'hiring.candidate-hired'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly candidateId: string,
    public readonly startDate: string,
  ) {}
}
