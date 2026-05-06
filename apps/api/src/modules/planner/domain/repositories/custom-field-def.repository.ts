export type CustomFieldKind = 'text' | 'number' | 'date' | 'yes_no' | 'choice'

export const CUSTOM_FIELD_DEF_REPOSITORY = Symbol('ICustomFieldDefRepository')

export interface CustomFieldDefRecord {
  id: string
  tenantId: string
  planId: string
  name: string
  kind: CustomFieldKind
  choiceOptions: string[] | null
  position: number
}

export interface ICustomFieldDefRepository {
  countByPlan(planId: string, tenantId: string): Promise<number>
  save(record: CustomFieldDefRecord): Promise<void>
  findById(id: string, tenantId: string): Promise<CustomFieldDefRecord | null>
  listByPlan(planId: string, tenantId: string): Promise<CustomFieldDefRecord[]>
  update(record: CustomFieldDefRecord): Promise<void>
  delete(id: string, tenantId: string): Promise<void>
}
