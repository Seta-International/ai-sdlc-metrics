export class DismissInsightCommand {
  constructor(
    readonly tenantId: string,
    readonly insightId: string,
  ) {}
}
