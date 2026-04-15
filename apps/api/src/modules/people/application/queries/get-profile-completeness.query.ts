export class GetProfileCompletenessQuery {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
  ) {}
}

export interface CompletenessResult {
  score: number
  filled: number
  total: number
  missing: Array<{
    fieldPath: string
    label: string
    section: string
    isRequired: boolean
    deadlineDays: number | null
  }>
}
