export class InvoiceApprovedEvent {
  static readonly eventName = 'finance.invoice-approved'
  constructor(
    public readonly tenantId: string,
    public readonly invoiceId: string,
    public readonly approvedBy: string,
    public readonly amount: number,
  ) {}
}
