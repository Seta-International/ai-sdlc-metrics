export interface ProfileChangeItem {
  fieldPath: string
  oldValue: unknown | null
  newValue: unknown
  effectiveDate?: Date | null
}

export class RequestProfileChangesCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly changes: ProfileChangeItem[],
    readonly requestedBy: string,
    readonly reason?: string | null,
  ) {}
}
