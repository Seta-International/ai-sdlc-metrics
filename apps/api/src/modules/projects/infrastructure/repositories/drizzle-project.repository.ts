import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, sql } from 'drizzle-orm'
import type { Project, DeliveryModel } from '../../domain/entities/project.entity'
import type { IProjectRepository } from '../../domain/repositories/project.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { project } from '../schema/index'

@Injectable()
export class DrizzleProjectRepository implements IProjectRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Project | null> {
    const rows = await this.db
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Project | undefined) ?? null
  }

  async findByAccountId(accountId: string, tenantId: string): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(project)
      .where(and(eq(project.accountId, accountId), eq(project.tenantId, tenantId)))
    return rows as Project[]
  }

  async insert(data: {
    tenantId: string
    accountId: string
    name: string
    code: string | null
    description: string | null
    deliveryModel: DeliveryModel | null
    startedAt: Date | null
    tags: unknown
  }): Promise<Project> {
    const rows = await this.db
      .insert(project)
      .values({
        tenantId: data.tenantId,
        accountId: data.accountId,
        name: data.name,
        code: data.code,
        description: data.description,
        deliveryModel: data.deliveryModel,
        startedAt: data.startedAt,
        tags: data.tags,
      })
      .returning()
    return rows[0] as Project
  }

  async update(id: string, tenantId: string, data: Partial<Project>): Promise<void> {
    await this.db
      .update(project)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(project.id, id), eq(project.tenantId, tenantId)))
  }

  async list(
    tenantId: string,
    options: { limit: number; offset: number; accountId?: string },
  ): Promise<Project[]> {
    const conditions = [eq(project.tenantId, tenantId)]
    if (options.accountId) {
      conditions.push(eq(project.accountId, options.accountId))
    }
    const rows = await this.db
      .select()
      .from(project)
      .where(and(...conditions))
      .limit(options.limit)
      .offset(options.offset)
    return rows as Project[]
  }

  async count(tenantId: string, options?: { accountId?: string }): Promise<number> {
    const conditions = [eq(project.tenantId, tenantId)]
    if (options?.accountId) {
      conditions.push(eq(project.accountId, options.accountId))
    }
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(project)
      .where(and(...conditions))
    return Number(result[0]?.count ?? 0)
  }
}
