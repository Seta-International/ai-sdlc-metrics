import type { FieldEditPolicy } from '../entities/field-edit-policy.entity'

export const FIELD_EDIT_POLICY_REPOSITORY = Symbol('IFieldEditPolicyRepository')

export interface IFieldEditPolicyRepository {
  findByTenant(tenantId: string): Promise<FieldEditPolicy[]>
  findByFieldPath(fieldPath: string, tenantId: string): Promise<FieldEditPolicy | null>
  upsert(data: Omit<FieldEditPolicy, 'id'>): Promise<FieldEditPolicy>
  upsertMany(data: Omit<FieldEditPolicy, 'id'>[]): Promise<FieldEditPolicy[]>
}
