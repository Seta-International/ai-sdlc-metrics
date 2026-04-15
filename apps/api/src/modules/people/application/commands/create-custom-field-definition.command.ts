export class CreateCustomFieldDefinitionCommand {
  constructor(
    readonly tenantId: string,
    readonly fieldKey: string,
    readonly label: string,
    readonly fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select',
    readonly createdBy: string,
    readonly fieldGroup?: string | null,
    readonly isRequired?: boolean,
    readonly isSearchable?: boolean,
    readonly isFilterable?: boolean,
    readonly sortOrder?: number,
    readonly validation?: Record<string, unknown> | null,
    readonly options?: Array<{ value: string; label: string }> | null,
    readonly visibilityTier?: 'public' | 'restricted' | 'confidential',
  ) {}
}
