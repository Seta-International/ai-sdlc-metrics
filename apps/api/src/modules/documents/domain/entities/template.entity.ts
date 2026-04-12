import type { TemplateFormat } from '../value-objects/template-format.vo'

export interface Template {
  id: string
  tenantId: string
  slug: string
  name: string
  format: TemplateFormat
  content: string
  version: number
  isDefault: boolean
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}
