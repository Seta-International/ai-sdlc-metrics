export class AcknowledgePolicyCommand {
  constructor(
    readonly tenantId: string,
    readonly employeeDocumentId: string,
    readonly acknowledgedBy: string,
  ) {}
}
