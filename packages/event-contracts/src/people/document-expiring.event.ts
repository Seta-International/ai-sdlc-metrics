export class DocumentExpiringEvent {
  static readonly eventName = 'people.document-expiring'
  constructor(
    public readonly tenantId: string,
    public readonly employmentId: string,
    public readonly documentId: string,
    public readonly category: string,
    public readonly expiryDate: Date,
    public readonly daysRemaining: number,
  ) {}
}
