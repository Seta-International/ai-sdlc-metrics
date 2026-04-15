import type { CountryFieldConfig } from '../entities/country-field-config.entity'

export const COUNTRY_FIELD_CONFIG_REPOSITORY = Symbol('ICountryFieldConfigRepository')

export interface ICountryFieldConfigRepository {
  findById(id: string, tenantId: string): Promise<CountryFieldConfig | null>
  findByCountryCode(countryCode: string, tenantId: string): Promise<CountryFieldConfig[]>
  findByCountryAndKey(
    countryCode: string,
    fieldKey: string,
    tenantId: string,
  ): Promise<CountryFieldConfig | null>
  insertMany(
    tenantId: string,
    data: Omit<CountryFieldConfig, 'id'>[],
  ): Promise<CountryFieldConfig[]>
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CountryFieldConfig, 'id' | 'tenantId' | 'countryCode' | 'fieldKey'>>,
  ): Promise<CountryFieldConfig>
}
