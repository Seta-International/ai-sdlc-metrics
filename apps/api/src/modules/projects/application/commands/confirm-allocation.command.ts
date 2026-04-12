export class ConfirmAllocationCommand {
  constructor(
    readonly tenantId: string,
    readonly allocationId: string,
  ) {}
}
