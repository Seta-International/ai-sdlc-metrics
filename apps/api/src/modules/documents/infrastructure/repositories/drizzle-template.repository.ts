import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import type { Template } from '../../domain/entities/template.entity'
import type { TemplateFormat } from '../../domain/value-objects/template-format.vo'
import { template } from '../schema/documents.schema'

@Injectable()
export class DrizzleTemplateRepository implements ITemplateRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findBySlugAndTenant(tenantId: string, slug: string): Promise<Template | null> {
    const rows = await this.db
      .select()
      .from(template)
      .where(and(eq(template.tenantId, tenantId), eq(template.slug, slug)))
      .limit(1)
    return (rows[0] as Template | undefined) ?? null
  }

  async findById(tenantId: string, id: string): Promise<Template | null> {
    const rows = await this.db
      .select()
      .from(template)
      .where(and(eq(template.tenantId, tenantId), eq(template.id, id)))
      .limit(1)
    return (rows[0] as Template | undefined) ?? null
  }

  async findByTenant(tenantId: string): Promise<Template[]> {
    const rows = await this.db.select().from(template).where(eq(template.tenantId, tenantId))
    return rows as Template[]
  }

  async listByTenant(
    tenantId: string,
    filters?: { format?: TemplateFormat; limit?: number; offset?: number },
  ): Promise<Template[]> {
    const conditions = [eq(template.tenantId, tenantId)]
    if (filters?.format) conditions.push(eq(template.format, filters.format))

    let q = this.db
      .select()
      .from(template)
      .where(and(...conditions))
      .$dynamic()
    if (filters?.limit !== undefined) q = q.limit(filters.limit)
    if (filters?.offset !== undefined) q = q.offset(filters.offset)

    return (await q) as Template[]
  }

  async insert(data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template> {
    const rows = await this.db
      .insert(template)
      .values({
        tenantId: data.tenantId,
        slug: data.slug,
        name: data.name,
        format: data.format,
        content: data.content,
        version: data.version,
        isDefault: data.isDefault,
        createdBy: data.createdBy ?? undefined,
      })
      .returning()
    return rows[0] as Template
  }
}
