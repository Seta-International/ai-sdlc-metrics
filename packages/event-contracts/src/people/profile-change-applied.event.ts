export class ProfileChangeAppliedEvent {
  static readonly eventName = 'people.profile-change-applied'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly fieldPath: string,
    public readonly oldValue: unknown,
    public readonly newValue: unknown,
    public readonly effectiveDate: Date,
  ) {}
}
