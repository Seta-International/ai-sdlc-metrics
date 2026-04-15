export interface DirectorySearchIndex {
  id: string
  tenantId: string
  employmentId: string
  fullName: string
  fullNameUnaccented: string
  companyEmail: string | null
  jobTitle: string | null
  jobLevel: string | null
  departmentName: string | null
  locationName: string | null
  managerName: string | null
  workArrangement: string
  employmentStatus: string
  hireDate: Date | null
  skills: string[] | null
  countryCode: string
  updatedAt: Date
}
