import type { CustomFieldKind } from '../../../domain/repositories/custom-field-def.repository'

export class DefineCustomFieldCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly actorId: string,
    public readonly name: string,
    public readonly kind: CustomFieldKind,
    public readonly choiceOptions: string[] | null,
    public readonly position: number,
  ) {}
}
