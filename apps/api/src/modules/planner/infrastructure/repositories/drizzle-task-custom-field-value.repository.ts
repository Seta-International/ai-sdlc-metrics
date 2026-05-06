import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerTaskCustomFieldValue } from '../schema/planner.schema'
import type {
  CustomFieldValuePayload,
  ITaskCustomFieldValueRepository,
  TaskCustomFieldValueRecord,
} from '../../domain/repositories/task-custom-field-value.repository'

export class DrizzleTaskCustomFieldValueRepository implements ITaskCustomFieldValueRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async upsert(record: TaskCustomFieldValueRecord): Promise<void> {
    const valueColumns = this.payloadToColumns(record.value)
    await this.db
      .insert(plannerTaskCustomFieldValue)
      .values({
        tenantId: record.tenantId,
        taskId: record.taskId,
        fieldDefId: record.fieldDefId,
        ...valueColumns,
      })
      .onConflictDoUpdate({
        target: [plannerTaskCustomFieldValue.taskId, plannerTaskCustomFieldValue.fieldDefId],
        set: valueColumns,
      })
  }

  async listByTask(taskId: string, tenantId: string): Promise<TaskCustomFieldValueRecord[]> {
    const rows = await this.db
      .select()
      .from(plannerTaskCustomFieldValue)
      .where(
        and(
          eq(plannerTaskCustomFieldValue.taskId, taskId),
          eq(plannerTaskCustomFieldValue.tenantId, tenantId),
        ),
      )
    return rows.map((r) => ({
      taskId: r.taskId,
      fieldDefId: r.fieldDefId,
      tenantId: r.tenantId,
      value: this.columnsToPayload(r),
    }))
  }

  async deleteByDef(fieldDefId: string, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerTaskCustomFieldValue)
      .where(
        and(
          eq(plannerTaskCustomFieldValue.fieldDefId, fieldDefId),
          eq(plannerTaskCustomFieldValue.tenantId, tenantId),
        ),
      )
  }

  private payloadToColumns(value: CustomFieldValuePayload) {
    if ('text' in value)
      return {
        valueText: value.text,
        valueNumber: null,
        valueDate: null,
        valueYesNo: null,
        valueChoice: null,
      }
    if ('number' in value)
      return {
        valueText: null,
        valueNumber: String(value.number),
        valueDate: null,
        valueYesNo: null,
        valueChoice: null,
      }
    if ('date' in value)
      return {
        valueText: null,
        valueNumber: null,
        valueDate: value.date,
        valueYesNo: null,
        valueChoice: null,
      }
    if ('yesNo' in value)
      return {
        valueText: null,
        valueNumber: null,
        valueDate: null,
        valueYesNo: value.yesNo,
        valueChoice: null,
      }
    return {
      valueText: null,
      valueNumber: null,
      valueDate: null,
      valueYesNo: null,
      valueChoice: (value as { choice: string }).choice,
    }
  }

  private columnsToPayload(r: {
    valueText: string | null
    valueNumber: string | null
    valueDate: string | null
    valueYesNo: boolean | null
    valueChoice: string | null
  }): CustomFieldValuePayload {
    if (r.valueText !== null) return { text: r.valueText }
    if (r.valueNumber !== null) return { number: parseFloat(r.valueNumber) }
    if (r.valueDate !== null) return { date: r.valueDate }
    if (r.valueYesNo !== null) return { yesNo: r.valueYesNo }
    return { choice: r.valueChoice ?? '' }
  }
}
