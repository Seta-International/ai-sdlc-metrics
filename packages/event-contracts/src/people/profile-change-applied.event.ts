export interface AppliedChange {
  fieldPath: string
  oldValue: unknown
  newValue: unknown
}

export class ProfileChangeAppliedEvent {
  static readonly eventName = 'people.profile-change-applied'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly appliedChanges: AppliedChange[],
  ) {}
}
