export type OrgChartRelationshipToViewer = 'self' | 'manager' | 'peer' | 'direct_report' | 'root'

export type OrgChartNodeDto = {
  employmentId: string
  personProfileId: string
  fullName: string
  jobTitle: string | null
  departmentName: string | null
  locationName: string | null
  avatarUrl: string | null
  managerEmploymentId: string | null
  directReportCount: number
  hasDirectReports: boolean
  relationshipToViewer?: OrgChartRelationshipToViewer
}

export type OrgChartContextDto = {
  nodes: OrgChartNodeDto[]
  rootEmploymentIds: string[]
  focusEmploymentId: string | null
}
