export class ArchiveNotificationCommand {
  constructor(
    public readonly tenantId: string,
    public readonly ids: string[],
  ) {}
}
