export interface JobAssignmentChanges {
  jobProfileId?: { old: string | null; new: string }
  departmentId?: { old: string | null; new: string | null }
  managerId?: { old: string | null; new: string | null }
  locationId?: { old: string | null; new: string | null }
  workArrangement?: { old: string; new: string }
}

export class JobAssignmentChangedEvent {
  static readonly eventName = 'people.job-assignment-changed'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly actorId: string,
    public readonly eventType: string,
    public readonly effectiveFrom: Date,
    public readonly changes: JobAssignmentChanges,
  ) {}
}
