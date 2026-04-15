import type { CountryFieldConfig } from '../entities/country-field-config.entity'

export const COUNTRY_FIELD_CONFIG_REPOSITORY = Symbol('ICountryFieldConfigRepository')

export interface ICountryFieldConfigRepository {
  findById(id: string): Promise<CountryFieldConfig | null>
  findByCountryCode(countryCode: string): Promise<CountryFieldConfig[]>
  findByCountryAndKey(countryCode: string, fieldKey: string): Promise<CountryFieldConfig | null>
  insertMany(data: Omit<CountryFieldConfig, 'id'>[]): Promise<CountryFieldConfig[]>
  update(
    id: string,
    data: Partial<Omit<CountryFieldConfig, 'id' | 'countryCode' | 'fieldKey'>>,
  ): Promise<CountryFieldConfig>
}
