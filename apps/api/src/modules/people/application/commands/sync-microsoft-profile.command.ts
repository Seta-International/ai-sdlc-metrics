export class SyncMicrosoftProfileCommand {
  constructor(
    readonly tenantId: string,
    readonly employmentId: string,
    readonly performedBy: string,
  ) {}
}
