import type { CustomFieldValuePayload } from '../../../domain/repositories/task-custom-field-value.repository'

export class SetCustomFieldValueCommand {
  constructor(
    public readonly tenantId: string,
    public readonly planId: string,
    public readonly taskId: string,
    public readonly actorId: string,
    public readonly fieldDefId: string,
    public readonly value: CustomFieldValuePayload,
  ) {}
}
