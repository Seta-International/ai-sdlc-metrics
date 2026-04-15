export class ListIncompleteProfilesQuery {
  constructor(
    readonly tenantId: string,
    readonly threshold: number = 80,
  ) {}
}

export interface IncompleteProfileResult {
  employmentId: string
  score: number
  filled: number
  total: number
}
