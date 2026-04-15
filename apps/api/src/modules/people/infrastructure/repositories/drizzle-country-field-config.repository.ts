import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '@future/db'
import type { CountryFieldConfig } from '../../domain/entities/country-field-config.entity'
import type { ICountryFieldConfigRepository } from '../../domain/repositories/country-field-config.repository'
import { countryFieldConfig } from '../schema/extensibility.schema'

@Injectable()
export class DrizzleCountryFieldConfigRepository implements ICountryFieldConfigRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string): Promise<CountryFieldConfig | null> {
    const rows = await this.db
      .select()
      .from(countryFieldConfig)
      .where(eq(countryFieldConfig.id, id))
      .limit(1)
    return (rows[0] as CountryFieldConfig | undefined) ?? null
  }

  async findByCountryCode(countryCode: string): Promise<CountryFieldConfig[]> {
    return (await this.db
      .select()
      .from(countryFieldConfig)
      .where(eq(countryFieldConfig.countryCode, countryCode))
      .orderBy(countryFieldConfig.sortOrder)) as CountryFieldConfig[]
  }

  async findByCountryAndKey(
    countryCode: string,
    fieldKey: string,
  ): Promise<CountryFieldConfig | null> {
    const rows = await this.db
      .select()
      .from(countryFieldConfig)
      .where(
        and(
          eq(countryFieldConfig.countryCode, countryCode),
          eq(countryFieldConfig.fieldKey, fieldKey),
        ),
      )
      .limit(1)
    return (rows[0] as CountryFieldConfig | undefined) ?? null
  }

  async insertMany(data: Omit<CountryFieldConfig, 'id'>[]): Promise<CountryFieldConfig[]> {
    return (await this.db
      .insert(countryFieldConfig)
      .values(data as Record<string, unknown>[])
      .returning()) as CountryFieldConfig[]
  }

  async update(
    id: string,
    data: Partial<Omit<CountryFieldConfig, 'id' | 'countryCode' | 'fieldKey'>>,
  ): Promise<CountryFieldConfig> {
    const rows = await this.db
      .update(countryFieldConfig)
      .set(data as Record<string, unknown>)
      .where(eq(countryFieldConfig.id, id))
      .returning()
    return rows[0] as CountryFieldConfig
  }
}
