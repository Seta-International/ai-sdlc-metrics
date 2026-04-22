import type { L3PreferenceEntity } from '../entities/l3-preference.entity'

export interface L3PreferenceRepository {
  set(opts: {
    tenantId: string
    userId: string
    key: string
    value: unknown
    updatedBy: string
  }): Promise<void>

  get(opts: { tenantId: string; userId: string; key: string }): Promise<unknown | null>

  getAll(opts: { tenantId: string; userId: string }): Promise<Record<string, unknown>>

  delete(opts: { tenantId: string; userId: string; key?: string }): Promise<void>
}

export const L3_PREFERENCE_REPOSITORY = Symbol('L3_PREFERENCE_REPOSITORY')

export type { L3PreferenceEntity }
