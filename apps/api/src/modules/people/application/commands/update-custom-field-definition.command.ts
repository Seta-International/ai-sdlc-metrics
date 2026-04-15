export class UpdateCustomFieldDefinitionCommand {
  constructor(
    readonly tenantId: string,
    readonly fieldDefinitionId: string,
    readonly updatedBy: string,
    readonly label?: string,
    readonly fieldGroup?: string | null,
    readonly isRequired?: boolean,
    readonly isSearchable?: boolean,
    readonly isFilterable?: boolean,
    readonly sortOrder?: number,
    readonly validation?: Record<string, unknown> | null,
    readonly options?: Array<{ value: string; label: string }> | null,
    readonly visibilityTier?: 'public' | 'restricted' | 'confidential',
    readonly isActive?: boolean,
  ) {}
}
