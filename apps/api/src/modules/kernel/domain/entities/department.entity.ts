export interface Department {
  id: string
  tenantId: string
  name: string
  parentId: string | null
  costCenterCode: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
