export class GetEffectivePermissionsQuery {
  constructor(
    readonly actorId: string,
    readonly tenantId: string,
  ) {}
}
