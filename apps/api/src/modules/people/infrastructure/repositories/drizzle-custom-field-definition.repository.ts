import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type { CustomFieldDefinition } from '../../domain/entities/custom-field-definition.entity'
import type { ICustomFieldDefinitionRepository } from '../../domain/repositories/custom-field-definition.repository'
import { customFieldDefinition } from '../schema/extensibility.schema'

@Injectable()
export class DrizzleCustomFieldDefinitionRepository implements ICustomFieldDefinitionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<CustomFieldDefinition | null> {
    const rows = await this.db
      .select()
      .from(customFieldDefinition)
      .where(and(eq(customFieldDefinition.id, id), eq(customFieldDefinition.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as CustomFieldDefinition | undefined) ?? null
  }

  async findByFieldKey(fieldKey: string, tenantId: string): Promise<CustomFieldDefinition | null> {
    const rows = await this.db
      .select()
      .from(customFieldDefinition)
      .where(
        and(
          eq(customFieldDefinition.fieldKey, fieldKey),
          eq(customFieldDefinition.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as CustomFieldDefinition | undefined) ?? null
  }

  async findByTenant(tenantId: string, activeOnly?: boolean): Promise<CustomFieldDefinition[]> {
    const conditions = [eq(customFieldDefinition.tenantId, tenantId)]
    if (activeOnly) {
      conditions.push(eq(customFieldDefinition.isActive, true))
    }
    return (await this.db
      .select()
      .from(customFieldDefinition)
      .where(and(...conditions))
      .orderBy(asc(customFieldDefinition.sortOrder))) as CustomFieldDefinition[]
  }

  async insert(
    data: Omit<CustomFieldDefinition, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomFieldDefinition> {
    const rows = await this.db
      .insert(customFieldDefinition)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as CustomFieldDefinition
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CustomFieldDefinition, 'id' | 'tenantId' | 'fieldKey' | 'createdAt'>>,
  ): Promise<CustomFieldDefinition> {
    const rows = await this.db
      .update(customFieldDefinition)
      .set(data as Record<string, unknown>)
      .where(and(eq(customFieldDefinition.id, id), eq(customFieldDefinition.tenantId, tenantId)))
      .returning()
    return rows[0] as CustomFieldDefinition
  }
}
