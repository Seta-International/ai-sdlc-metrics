import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, inArray } from 'drizzle-orm'
import type {
  OnboardingCase,
  OnboardingCaseStage,
  OnboardingCaseStatus,
} from '../../domain/entities/onboarding-case.entity'
import type { OnboardingTemplate } from '../../domain/entities/onboarding-template.entity'
import type { EmploymentType } from '../../domain/value-objects/employment-status'
import type { IOnboardingCaseRepository } from '../../domain/repositories/onboarding-case.repository'
import type { IOnboardingTemplateRepository } from '../../domain/repositories/onboarding-template.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import {
  onboardingCase,
  onboardingTask,
  onboardingTaskTemplate,
  onboardingTemplate,
} from '../schema/index'

@Injectable()
export class DrizzleOnboardingCaseRepository implements IOnboardingCaseRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<OnboardingCase | null> {
    const rows = await this.db
      .select()
      .from(onboardingCase)
      .where(and(eq(onboardingCase.id, id), eq(onboardingCase.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as OnboardingCase | undefined) ?? null
  }

  async findByEmploymentId(employmentId: string, tenantId: string): Promise<OnboardingCase | null> {
    const rows = await this.db
      .select()
      .from(onboardingCase)
      .where(
        and(eq(onboardingCase.employmentId, employmentId), eq(onboardingCase.tenantId, tenantId)),
      )
      .limit(1)
    return (rows[0] as OnboardingCase | undefined) ?? null
  }

  async insert(
    data: Omit<OnboardingCase, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<OnboardingCase> {
    const rows = await this.db
      .insert(onboardingCase)
      .values({
        tenantId: data.tenantId,
        employmentId: data.employmentId,
        templateId: data.templateId ?? undefined,
        status: data.status,
      })
      .returning()
    return rows[0] as OnboardingCase
  }

  async updateStatus(id: string, tenantId: string, status: OnboardingCaseStatus): Promise<void> {
    await this.db
      .update(onboardingCase)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(onboardingCase.id, id), eq(onboardingCase.tenantId, tenantId)))
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
    await this.db.insert(onboardingTask).values({
      tenantId: data.tenantId,
      caseId: data.caseId,
      assigneeActorId: data.actorId ?? undefined,
      title: data.title,
      description: data.description ?? null,
      assigneeRole: data.assigneeRole as 'hr' | 'it' | 'project_manager' | 'employee',
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
        id: onboardingTask.id,
        status: onboardingTask.status,
        isRequired: onboardingTask.isRequired,
      })
      .from(onboardingTask)
      .where(
        and(
          eq(onboardingTask.caseId, caseId),
          eq(onboardingTask.tenantId, tenantId),
          eq(onboardingTask.isRequired, true),
        ),
      )
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
      .update(onboardingTask)
      .set({
        status,
        completedAt: completedAt ?? undefined,
        evidenceUrl: evidenceUrl ?? undefined,
      })
      .where(and(eq(onboardingTask.id, taskId), eq(onboardingTask.tenantId, tenantId)))
  }

  async findTaskById(
    taskId: string,
    tenantId: string,
  ): Promise<{ id: string; caseId: string; status: string; isRequired: boolean } | null> {
    const rows = await this.db
      .select({
        id: onboardingTask.id,
        caseId: onboardingTask.caseId,
        status: onboardingTask.status,
        isRequired: onboardingTask.isRequired,
      })
      .from(onboardingTask)
      .where(and(eq(onboardingTask.id, taskId), eq(onboardingTask.tenantId, tenantId)))
      .limit(1)
    return rows[0] ?? null
  }

  async findAllActive(tenantId: string): Promise<OnboardingCase[]> {
    const rows = await this.db
      .select()
      .from(onboardingCase)
      .where(and(eq(onboardingCase.tenantId, tenantId), eq(onboardingCase.status, 'in_progress')))
    return rows as OnboardingCase[]
  }

  async updateStage(id: string, tenantId: string, stage: OnboardingCaseStage): Promise<void> {
    await this.db
      .update(onboardingCase)
      .set({ stage, updatedAt: new Date() })
      .where(and(eq(onboardingCase.id, id), eq(onboardingCase.tenantId, tenantId)))
  }

  async getTaskAggregates(
    caseIds: string[],
    tenantId: string,
  ): Promise<
    Array<{ caseId: string; tasksTotal: number; tasksCompleted: number; blockers: number }>
  > {
    if (caseIds.length === 0) return []
    const rows = await this.db
      .select({
        caseId: onboardingTask.caseId,
        status: onboardingTask.status,
        isRequired: onboardingTask.isRequired,
        dueDate: onboardingTask.dueDate,
      })
      .from(onboardingTask)
      .where(and(eq(onboardingTask.tenantId, tenantId), inArray(onboardingTask.caseId, caseIds)))

    const map = new Map<string, { tasksTotal: number; tasksCompleted: number; blockers: number }>()
    for (const caseId of caseIds) map.set(caseId, { tasksTotal: 0, tasksCompleted: 0, blockers: 0 })
    const now = new Date()
    for (const row of rows) {
      const agg = map.get(row.caseId)!
      agg.tasksTotal++
      if (row.status === 'completed') agg.tasksCompleted++
      if (row.status === 'pending' && row.isRequired && row.dueDate && row.dueDate < now)
        agg.blockers++
    }
    return Array.from(map.entries()).map(([caseId, agg]) => ({ caseId, ...agg }))
  }
}

@Injectable()
export class DrizzleOnboardingTemplateRepository implements IOnboardingTemplateRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<OnboardingTemplate | null> {
    const rows = await this.db
      .select()
      .from(onboardingTemplate)
      .where(and(eq(onboardingTemplate.id, id), eq(onboardingTemplate.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as OnboardingTemplate | undefined) ?? null
  }

  async findByEmploymentType(
    employmentType: EmploymentType,
    tenantId: string,
  ): Promise<OnboardingTemplate | null> {
    const rows = await this.db
      .select()
      .from(onboardingTemplate)
      .where(
        and(
          eq(onboardingTemplate.tenantId, tenantId),
          eq(onboardingTemplate.employmentType, employmentType),
          eq(onboardingTemplate.isActive, true),
        ),
      )
      .limit(1)
    return (rows[0] as OnboardingTemplate | undefined) ?? null
  }

  async findDefault(tenantId: string): Promise<OnboardingTemplate | null> {
    const rows = await this.db
      .select()
      .from(onboardingTemplate)
      .where(
        and(
          eq(onboardingTemplate.tenantId, tenantId),
          eq(onboardingTemplate.isDefault, true),
          eq(onboardingTemplate.isActive, true),
        ),
      )
      .limit(1)
    return (rows[0] as OnboardingTemplate | undefined) ?? null
  }

  async listByTenant(tenantId: string): Promise<OnboardingTemplate[]> {
    const rows = await this.db
      .select()
      .from(onboardingTemplate)
      .where(eq(onboardingTemplate.tenantId, tenantId))
    return rows as OnboardingTemplate[]
  }

  async insert(data: Omit<OnboardingTemplate, 'id'>): Promise<OnboardingTemplate> {
    const rows = await this.db
      .insert(onboardingTemplate)
      .values({
        tenantId: data.tenantId,
        name: data.name,
        employmentType: data.employmentType ?? undefined,
        isDefault: data.isDefault,
        isActive: data.isActive,
      })
      .returning()
    return rows[0] as OnboardingTemplate
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<OnboardingTemplate, 'id' | 'tenantId'>>,
  ): Promise<OnboardingTemplate> {
    const setValues: Partial<typeof onboardingTemplate.$inferInsert> = {}
    if (data.name !== undefined) setValues.name = data.name
    if (data.employmentType !== undefined)
      setValues.employmentType = data.employmentType ?? undefined
    if (data.isDefault !== undefined) setValues.isDefault = data.isDefault
    if (data.isActive !== undefined) setValues.isActive = data.isActive
    const rows = await this.db
      .update(onboardingTemplate)
      .set(setValues)
      .where(and(eq(onboardingTemplate.id, id), eq(onboardingTemplate.tenantId, tenantId)))
      .returning()
    return rows[0] as OnboardingTemplate
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
      dueDaysAfterHire: number
      isRequired: boolean
    }>
  > {
    const rows = await this.db
      .select()
      .from(onboardingTaskTemplate)
      .where(
        and(
          eq(onboardingTaskTemplate.templateId, templateId),
          eq(onboardingTaskTemplate.tenantId, tenantId),
        ),
      )
      .orderBy(onboardingTaskTemplate.displayOrder)
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      templateId: r.templateId,
      title: r.title,
      description: r.description ?? null,
      assigneeRole: r.assigneeRole,
      dueDaysAfterHire: r.dueDaysAfterHire,
      isRequired: r.isRequired,
    }))
  }
}
