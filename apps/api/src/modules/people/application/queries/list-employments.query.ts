import type { EmploymentStatus } from '../../domain/value-objects/employment-status'

export class ListEmploymentsQuery {
  constructor(
    readonly tenantId: string,
    readonly limit: number,
    readonly offset: number,
    readonly status?: EmploymentStatus,
    readonly countryCode?: string,
  ) {}
}
