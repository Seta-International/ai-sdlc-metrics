export class ProfileIncompleteEvent {
  static readonly eventName = 'people.profile-incomplete'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly completenessScore: number,
    public readonly missingFields: string[],
  ) {}
}
