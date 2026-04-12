export class CreateSystemActorCommand {
  constructor(
    readonly tenantId: string,
    readonly displayName: string,
    readonly createdBy: string,
  ) {}
}
