import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, notInArray } from 'drizzle-orm'
import type {
  OffboardingCase,
  OffboardingCaseStatus,
} from '../../domain/entities/offboarding-case.entity'
import type { OffboardingTemplate } from '../../domain/entities/offboarding-template.entity'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding-case.repository'
import type { IOffboardingTemplateRepository } from '../../domain/repositories/offboarding-template.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import {
  offboardingCase,
  offboardingTask,
  offboardingTaskTemplate,
  offboardingTemplate,
} from '../schema/index'

@Injectable()
export class DrizzleOffboardingCaseRepository implements IOffboardingCaseRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<OffboardingCase | null> {
    const rows = await this.db
      .select()
      .from(offboardingCase)
      .where(and(eq(offboardingCase.id, id), eq(offboardingCase.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as OffboardingCase | undefined) ?? null
  }

  async findActiveByProfileId(
    profileId: string,
    tenantId: string,
  ): Promise<OffboardingCase | null> {
    const rows = await this.db
      .select()
      .from(offboardingCase)
      .where(
        and(
          eq(offboardingCase.profileId, profileId),
          eq(offboardingCase.tenantId, tenantId),
          notInArray(offboardingCase.status, ['completed', 'rejected']),
        ),
      )
      .limit(1)
    return (rows[0] as OffboardingCase | undefined) ?? null
  }

  async insert(
    data: Omit<OffboardingCase, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<OffboardingCase> {
    const rows = await this.db
      .insert(offboardingCase)
      .values({
        tenantId: data.tenantId,
        profileId: data.profileId,
        templateId: data.templateId ?? undefined,
        reason: data.reason,
        reasonCategory: data.reasonCategory ?? undefined,
        decisionCaseId: data.decisionCaseId ?? undefined,
        status: data.status,
      })
      .returning()
    return rows[0] as OffboardingCase
  }

  async updateStatus(id: string, tenantId: string, status: OffboardingCaseStatus): Promise<void> {
    await this.db
      .update(offboardingCase)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(offboardingCase.id, id), eq(offboardingCase.tenantId, tenantId)))
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<OffboardingCase, 'status' | 'decisionCaseId'>>,
  ): Promise<void> {
    const setValues: Partial<typeof offboardingCase.$inferInsert> = { updatedAt: new Date() }
    if (data.status !== undefined) setValues.status = data.status
    if (data.decisionCaseId !== undefined) setValues.decisionCaseId = data.decisionCaseId
    await this.db
      .update(offboardingCase)
      .set(setValues)
      .where(and(eq(offboardingCase.id, id), eq(offboardingCase.tenantId, tenantId)))
  }

  async insertTask(data: {
    tenantId: string
    caseId: string
    actorId: string | null
    title: string
    description: string | null
    assigneeRole: string
    isRequired: boolean
    dueDate: Date
  }): Promise<void> {
    await this.db.insert(offboardingTask).values({
      tenantId: data.tenantId,
      caseId: data.caseId,
      assigneeActorId: data.actorId ?? undefined,
      title: data.title,
      description: data.description ?? null,
      assigneeRole: data.assigneeRole as
        | 'hr'
        | 'it'
        | 'project_manager'
        | 'employee'
        | 'account_manager',
      isRequired: data.isRequired,
      dueDate: data.dueDate,
      status: 'pending',
    })
  }

  async getRequiredTasks(
    caseId: string,
    tenantId: string,
  ): Promise<Array<{ id: string; status: string; isRequired: boolean }>> {
    const rows = await this.db
      .select({
        id: offboardingTask.id,
        status: offboardingTask.status,
        isRequired: offboardingTask.isRequired,
      })
      .from(offboardingTask)
      .where(and(eq(offboardingTask.caseId, caseId), eq(offboardingTask.tenantId, tenantId)))
    return rows
  }

  async updateTaskStatus(
    taskId: string,
    tenantId: string,
    status: 'pending' | 'completed' | 'skipped',
    completedAt?: Date,
    evidenceUrl?: string | null,
  ): Promise<void> {
    await this.db
      .update(offboardingTask)
      .set({
        status,
        completedAt: completedAt ?? undefined,
        evidenceUrl: evidenceUrl ?? undefined,
      })
      .where(and(eq(offboardingTask.id, taskId), eq(offboardingTask.tenantId, tenantId)))
  }

  async findTaskById(
    taskId: string,
    tenantId: string,
  ): Promise<{ id: string; caseId: string; status: string; isRequired: boolean } | null> {
    const rows = await this.db
      .select({
        id: offboardingTask.id,
        caseId: offboardingTask.caseId,
        status: offboardingTask.status,
        isRequired: offboardingTask.isRequired,
      })
      .from(offboardingTask)
      .where(and(eq(offboardingTask.id, taskId), eq(offboardingTask.tenantId, tenantId)))
      .limit(1)
    return rows[0] ?? null
  }
}

@Injectable()
export class DrizzleOffboardingTemplateRepository implements IOffboardingTemplateRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<OffboardingTemplate | null> {
    const rows = await this.db
      .select()
      .from(offboardingTemplate)
      .where(and(eq(offboardingTemplate.id, id), eq(offboardingTemplate.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as OffboardingTemplate | undefined) ?? null
  }

  async findByEmploymentTypeAndCategory(
    employmentType: string,
    reasonCategory: string,
    tenantId: string,
  ): Promise<OffboardingTemplate | null> {
    return this.findMatch(employmentType, reasonCategory, tenantId)
  }

  async findMatch(
    employmentType: string,
    reasonCategory: string,
    tenantId: string,
  ): Promise<OffboardingTemplate | null> {
    const rows = await this.db
      .select()
      .from(offboardingTemplate)
      .where(
        and(
          eq(offboardingTemplate.tenantId, tenantId),
          eq(
            offboardingTemplate.employmentType,
            employmentType as 'permanent' | 'fixed_term' | 'contractor' | 'intern',
          ),
          eq(
            offboardingTemplate.reasonCategory,
            reasonCategory as 'voluntary' | 'involuntary' | 'redundancy' | 'end_of_contract',
          ),
          eq(offboardingTemplate.isActive, true),
        ),
      )
      .limit(1)
    return (rows[0] as OffboardingTemplate | undefined) ?? null
  }

  async findDefault(tenantId: string): Promise<OffboardingTemplate | null> {
    const rows = await this.db
      .select()
      .from(offboardingTemplate)
      .where(
        and(
          eq(offboardingTemplate.tenantId, tenantId),
          eq(offboardingTemplate.isDefault, true),
          eq(offboardingTemplate.isActive, true),
        ),
      )
      .limit(1)
    return (rows[0] as OffboardingTemplate | undefined) ?? null
  }

  async listByTenant(tenantId: string): Promise<OffboardingTemplate[]> {
    const rows = await this.db
      .select()
      .from(offboardingTemplate)
      .where(eq(offboardingTemplate.tenantId, tenantId))
    return rows as OffboardingTemplate[]
  }

  async insert(data: Omit<OffboardingTemplate, 'id'>): Promise<OffboardingTemplate> {
    const rows = await this.db
      .insert(offboardingTemplate)
      .values({
        tenantId: data.tenantId,
        name: data.name,
        employmentType: data.employmentType ?? undefined,
        reasonCategory: data.reasonCategory ?? undefined,
        isDefault: data.isDefault,
        isActive: data.isActive,
      })
      .returning()
    return rows[0] as OffboardingTemplate
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<OffboardingTemplate, 'id' | 'tenantId'>>,
  ): Promise<OffboardingTemplate> {
    const setValues: Partial<typeof offboardingTemplate.$inferInsert> = {}
    if (data.name !== undefined) setValues.name = data.name
    if (data.employmentType !== undefined)
      setValues.employmentType = data.employmentType ?? undefined
    if (data.reasonCategory !== undefined)
      setValues.reasonCategory = data.reasonCategory ?? undefined
    if (data.isDefault !== undefined) setValues.isDefault = data.isDefault
    if (data.isActive !== undefined) setValues.isActive = data.isActive
    const rows = await this.db
      .update(offboardingTemplate)
      .set(setValues)
      .where(and(eq(offboardingTemplate.id, id), eq(offboardingTemplate.tenantId, tenantId)))
      .returning()
    return rows[0] as OffboardingTemplate
  }

  async getTaskTemplates(
    templateId: string,
    tenantId: string,
  ): Promise<
    Array<{
      id: string
      tenantId: string
      templateId: string
      title: string
      description: string | null
      assigneeRole: string
      dueDaysAfterTrigger: number
      isRequired: boolean
    }>
  > {
    const rows = await this.db
      .select()
      .from(offboardingTaskTemplate)
      .where(
        and(
          eq(offboardingTaskTemplate.templateId, templateId),
          eq(offboardingTaskTemplate.tenantId, tenantId),
        ),
      )
      .orderBy(offboardingTaskTemplate.displayOrder)
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      templateId: r.templateId,
      title: r.title,
      description: r.description ?? null,
      assigneeRole: r.assigneeRole,
      dueDaysAfterTrigger: r.dueDaysBeforeLastDay,
      isRequired: r.isRequired,
    }))
  }
}
