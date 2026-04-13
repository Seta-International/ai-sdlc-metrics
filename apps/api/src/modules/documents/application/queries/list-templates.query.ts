import type { TemplateFormat } from '../../domain/value-objects/template-format.vo'

export class ListTemplatesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly filters?: { format?: TemplateFormat; limit?: number; offset?: number },
  ) {}
}
