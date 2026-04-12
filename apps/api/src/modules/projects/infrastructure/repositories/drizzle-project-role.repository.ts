import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { ProjectRole, ProjectRoleStatus } from '../../domain/entities/project-role.entity'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { projectRole, allocation } from '../schema/index'

@Injectable()
export class DrizzleProjectRoleRepository implements IProjectRoleRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ProjectRole | null> {
    const rows = await this.db
      .select()
      .from(projectRole)
      .where(and(eq(projectRole.id, id), eq(projectRole.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ProjectRole | undefined) ?? null
  }

  async findByProjectId(projectId: string, tenantId: string): Promise<ProjectRole[]> {
    const rows = await this.db
      .select()
      .from(projectRole)
      .where(and(eq(projectRole.projectId, projectId), eq(projectRole.tenantId, tenantId)))
    return rows as ProjectRole[]
  }

  async insert(data: {
    tenantId: string
    projectId: string
    roleName: string
    skillsRequired: string[] | null
    headcount: number
  }): Promise<ProjectRole> {
    const rows = await this.db
      .insert(projectRole)
      .values({
        tenantId: data.tenantId,
        projectId: data.projectId,
        roleName: data.roleName,
        skillsRequired: data.skillsRequired,
        headcount: data.headcount,
      })
      .returning()
    return rows[0] as ProjectRole
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<ProjectRole, 'roleName' | 'skillsRequired' | 'headcount'>>,
  ): Promise<void> {
    await this.db
      .update(projectRole)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(projectRole.id, id), eq(projectRole.tenantId, tenantId)))
  }

  async updateStatus(id: string, tenantId: string, status: ProjectRoleStatus): Promise<void> {
    await this.db
      .update(projectRole)
      .set({ status })
      .where(and(eq(projectRole.id, id), eq(projectRole.tenantId, tenantId)))
  }

  async countActiveAllocations(id: string, tenantId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(allocation)
      .where(
        and(
          eq(allocation.projectRoleId, id),
          eq(allocation.tenantId, tenantId),
          isNull(allocation.endedAt),
        ),
      )
    return Number(result[0]?.count ?? 0)
  }
}
