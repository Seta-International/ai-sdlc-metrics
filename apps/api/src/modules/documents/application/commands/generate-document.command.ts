export class GenerateDocumentCommand {
  constructor(
    public readonly tenantId: string,
    public readonly requestedBy: string,
    public readonly templateSlug: string,
    public readonly inputData: Record<string, unknown>,
  ) {}
}
