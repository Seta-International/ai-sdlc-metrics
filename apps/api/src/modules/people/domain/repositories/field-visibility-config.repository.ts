import type { FieldVisibilityConfig } from '../entities/field-visibility-config.entity'

export const FIELD_VISIBILITY_CONFIG_REPOSITORY = Symbol('IFieldVisibilityConfigRepository')

export interface IFieldVisibilityConfigRepository {
  findByTenant(tenantId: string): Promise<FieldVisibilityConfig[]>
  findByFieldPath(fieldPath: string, tenantId: string): Promise<FieldVisibilityConfig | null>
  upsert(data: Omit<FieldVisibilityConfig, 'id'>): Promise<FieldVisibilityConfig>
  upsertMany(data: Omit<FieldVisibilityConfig, 'id'>[]): Promise<FieldVisibilityConfig[]>
}
