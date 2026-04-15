import type { CustomFieldDefinition } from '../entities/custom-field-definition.entity'

export const CUSTOM_FIELD_DEFINITION_REPOSITORY = Symbol('ICustomFieldDefinitionRepository')

export interface ICustomFieldDefinitionRepository {
  findById(id: string, tenantId: string): Promise<CustomFieldDefinition | null>
  findByFieldKey(fieldKey: string, tenantId: string): Promise<CustomFieldDefinition | null>
  findByTenant(tenantId: string, activeOnly?: boolean): Promise<CustomFieldDefinition[]>
  insert(
    data: Omit<CustomFieldDefinition, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomFieldDefinition>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CustomFieldDefinition, 'id' | 'tenantId' | 'fieldKey' | 'createdAt'>>,
  ): Promise<CustomFieldDefinition>
}
