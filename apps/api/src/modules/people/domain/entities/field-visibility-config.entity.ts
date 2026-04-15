import type { VisibilityTier } from '../value-objects/visibility-tier'

export interface FieldVisibilityConfig {
  id: string
  tenantId: string
  fieldPath: string
  visibilityTier: VisibilityTier
}
