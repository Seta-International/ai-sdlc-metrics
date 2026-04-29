import type { MsStagedUserStatus } from '../../domain/entities/ms-staged-user.entity'

export class ListStagedMsUsersQuery {
  constructor(
    public readonly tenantId: string,
    public readonly status: MsStagedUserStatus,
    public readonly limit: number,
    public readonly offset: number,
  ) {}
}
