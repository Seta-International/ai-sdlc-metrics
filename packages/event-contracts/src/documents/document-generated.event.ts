export class DocumentGeneratedEvent {
  static readonly eventName = 'documents.document-generated'
  constructor(
    public readonly tenantId: string,
    public readonly jobId: string,
    public readonly templateSlug: string,
    public readonly format: string,
    public readonly outputFileKey: string,
    public readonly requestedBy: string,
  ) {}
}
