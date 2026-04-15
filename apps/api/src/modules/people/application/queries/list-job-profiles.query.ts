export class ListJobProfilesQuery {
  constructor(
    readonly tenantId: string,
    readonly familyId?: string,
    readonly isActive?: boolean,
  ) {}
}
