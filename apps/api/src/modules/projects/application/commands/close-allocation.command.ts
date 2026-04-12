export class CloseAllocationCommand {
  constructor(
    readonly tenantId: string,
    readonly allocationId: string,
    readonly endedAt: Date,
  ) {}
}
