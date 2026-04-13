import type { TemplateFormat } from '../../domain/value-objects/template-format.vo'

export class CreateTemplateCommand {
  constructor(
    public readonly tenantId: string,
    public readonly createdBy: string,
    public readonly slug: string,
    public readonly name: string,
    public readonly format: TemplateFormat,
    public readonly content: string,
  ) {}
}
