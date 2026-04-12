export class TestIdpConnectionCommand {
  constructor(
    readonly tenantId: string,
    readonly providerId: string,
    readonly testedBy: string,
  ) {}
}
