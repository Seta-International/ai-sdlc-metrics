import type { NotificationCategory } from '../../domain/value-objects/category.vo'

export class UpdatePreferenceCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly category: NotificationCategory,
    public readonly inApp: boolean,
    public readonly email: boolean,
  ) {}
}
