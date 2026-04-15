export class ValidateImportCommand {
  constructor(
    readonly tenantId: string,
    readonly importJobId: string,
  ) {}
}
