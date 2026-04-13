export class GetTemplateByIdQuery {
  constructor(
    public readonly tenantId: string,
    public readonly templateId: string,
  ) {}
}
