export class RequestProfileChangeCommand {
  constructor(
    readonly tenantId: string,
    readonly profileId: string,
    readonly requestedBy: string,
    readonly fieldPath: string,
    readonly oldValue: unknown,
    readonly newValue: unknown,
  ) {}
}
