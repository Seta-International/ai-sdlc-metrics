export const TASK_CUSTOM_FIELD_VALUE_REPOSITORY = Symbol('ITaskCustomFieldValueRepository')

export type CustomFieldValuePayload =
  | { text: string }
  | { number: number }
  | { date: string }
  | { yesNo: boolean }
  | { choice: string }

export interface TaskCustomFieldValueRecord {
  taskId: string
  fieldDefId: string
  tenantId: string
  value: CustomFieldValuePayload
}

export interface ITaskCustomFieldValueRepository {
  upsert(record: TaskCustomFieldValueRecord): Promise<void>
  listByTask(taskId: string, tenantId: string): Promise<TaskCustomFieldValueRecord[]>
  deleteByDef(fieldDefId: string, tenantId: string): Promise<void>
}
