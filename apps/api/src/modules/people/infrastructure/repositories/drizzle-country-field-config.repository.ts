import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { CountryFieldConfig } from '../../domain/entities/country-field-config.entity'
import type { ICountryFieldConfigRepository } from '../../domain/repositories/country-field-config.repository'
import { countryFieldConfig } from '../schema/extensibility.schema'

@Injectable()
export class DrizzleCountryFieldConfigRepository implements ICountryFieldConfigRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<CountryFieldConfig | null> {
    const rows = await this.db
      .select()
      .from(countryFieldConfig)
      .where(and(eq(countryFieldConfig.id, id), eq(countryFieldConfig.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as CountryFieldConfig | undefined) ?? null
  }

  async findByCountryCode(countryCode: string, tenantId: string): Promise<CountryFieldConfig[]> {
    return (await this.db
      .select()
      .from(countryFieldConfig)
      .where(
        and(
          eq(countryFieldConfig.countryCode, countryCode),
          eq(countryFieldConfig.tenantId, tenantId),
        ),
      )
      .orderBy(countryFieldConfig.sortOrder)) as CountryFieldConfig[]
  }

  async findByCountryAndKey(
    countryCode: string,
    fieldKey: string,
    tenantId: string,
  ): Promise<CountryFieldConfig | null> {
    const rows = await this.db
      .select()
      .from(countryFieldConfig)
      .where(
        and(
          eq(countryFieldConfig.countryCode, countryCode),
          eq(countryFieldConfig.fieldKey, fieldKey),
          eq(countryFieldConfig.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as CountryFieldConfig | undefined) ?? null
  }

  async insertMany(
    tenantId: string,
    data: Omit<CountryFieldConfig, 'id'>[],
  ): Promise<CountryFieldConfig[]> {
    return (await this.db
      .insert(countryFieldConfig)
      .values(data.map((d) => ({ ...d, tenantId })) as (typeof countryFieldConfig.$inferInsert)[])
      .returning()) as CountryFieldConfig[]
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CountryFieldConfig, 'id' | 'tenantId' | 'countryCode' | 'fieldKey'>>,
  ): Promise<CountryFieldConfig> {
    const rows = await this.db
      .update(countryFieldConfig)
      .set(data as Record<string, unknown>)
      .where(and(eq(countryFieldConfig.id, id), eq(countryFieldConfig.tenantId, tenantId)))
      .returning()
    if (!rows[0]) throw new Error(`CountryFieldConfig not found: ${id}`)
    return rows[0] as CountryFieldConfig
  }
}
