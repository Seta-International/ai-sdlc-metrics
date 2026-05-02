export interface L3PreferenceEntity {
  tenantId: string
  userId: string
  key: string
  value: unknown
  updatedAt: Date
  updatedBy: string
}

/** Keys writable at MVP. Unknown keys are rejected at the service layer. */
export const L3_PREFERENCE_ALLOWLIST = [
  'display_format',
  'currency_display',
  'date_format',
  'timezone_display',
  'language',
  'theme',
] as const

export type L3PreferenceKey = (typeof L3_PREFERENCE_ALLOWLIST)[number]
