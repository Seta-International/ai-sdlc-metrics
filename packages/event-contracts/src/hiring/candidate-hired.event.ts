export class CandidateHiredEvent {
  static readonly eventName = 'hiring.candidate-hired'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly candidateId: string,
    public readonly startDate: string,
    public readonly familyName: string = '',
    public readonly givenName: string = '',
    public readonly middleName: string | null = null,
    public readonly countryCode: string = 'US',
    public readonly workerType: string = 'employee',
    public readonly employmentType: string = 'permanent',
    public readonly hireDate: Date = new Date(),
    public readonly jobProfileId: string = '',
    public readonly departmentId: string | null = null,
  ) {}
}
