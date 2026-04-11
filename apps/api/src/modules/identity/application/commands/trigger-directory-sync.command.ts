export class TriggerDirectorySyncCommand {
  constructor(
    readonly tenantId: string,
    readonly triggeredBy: string,
  ) {}
}
