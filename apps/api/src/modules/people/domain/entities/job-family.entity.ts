export interface JobFamily {
  id: string
  tenantId: string
  name: string
  description: string | null
  parentId: string | null
  isActive: boolean
  createdAt: Date
}
