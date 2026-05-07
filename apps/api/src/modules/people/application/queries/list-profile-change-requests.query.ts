import type { ChangeRequestStatus } from '../../domain/entities/profile-change-request.entity'

export class ListProfileChangeRequestsQuery {
  constructor(
    readonly tenantId: string,
    readonly mode: 'byEmployment' | 'queue',
    readonly employmentId: string | null,
    readonly status: ChangeRequestStatus | null,
    readonly limit: number,
    readonly offset: number,
  ) {}
}
