import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { Department } from '../../domain/entities/department.entity'
import type { IDepartmentRepository } from '../../domain/repositories/department.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { department } from '../schema/index'

@Injectable()
export class DrizzleDepartmentRepository implements IDepartmentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Department | null> {
    const rows = await this.db
      .select()
      .from(department)
      .where(and(eq(department.id, id), eq(department.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Department | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    name: string
    parentId?: string
    costCenterCode?: string
  }): Promise<Department> {
    const rows = await this.db
      .insert(department)
      .values({
        tenantId: data.tenantId,
        name: data.name,
        parentId: data.parentId,
        costCenterCode: data.costCenterCode,
      })
      .returning()
    return rows[0] as Department
  }
}
