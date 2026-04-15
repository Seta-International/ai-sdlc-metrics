export type EmailTransliteration = 'strip_diacritics' | 'custom_map'

export interface EmailGenerationConfig {
  tenantId: string
  domain: string
  pattern: string // e.g. '{given}.{family}'
  transliteration: EmailTransliteration
}
