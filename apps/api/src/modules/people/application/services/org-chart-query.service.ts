import { Inject, Injectable } from '@nestjs/common'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import type {
  OrgChartContextDto,
  OrgChartNodeDto,
  OrgChartRelationshipToViewer,
} from '../queries/org-chart.types'

@Injectable()
export class OrgChartQueryService {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly directoryRepo: IDirectorySearchIndexRepository,
  ) {}

  async getContext(tenantId: string, actorId: string): Promise<OrgChartContextDto> {
    const viewerEmployment = await this.employmentRepo.findActiveByActorId(actorId, tenantId)
    if (!viewerEmployment) return this.getRootContext(tenantId)

    const viewerAssignment = await this.assignmentRepo.findCurrent(viewerEmployment.id, tenantId)
    const peerAssignments = viewerAssignment?.managerId
      ? await this.assignmentRepo.findCurrentByManagerId(viewerAssignment.managerId, tenantId)
      : []
    const directReportAssignments = await this.assignmentRepo.findCurrentByManagerId(
      viewerEmployment.id,
      tenantId,
    )

    const orderedIds = [
      viewerAssignment?.managerId ?? null,
      viewerEmployment.id,
      ...peerAssignments
        .map((assignment) => assignment.employmentId)
        .filter((id) => id !== viewerEmployment.id),
      ...directReportAssignments.map((assignment) => assignment.employmentId),
    ].filter((id): id is string => Boolean(id))
    const uniqueIds = [...new Set(orderedIds)]

    const employments = await this.employmentRepo.findManyByIds(uniqueIds, tenantId)
    const assignments = await this.assignmentRepo.findCurrentMany(uniqueIds, tenantId)

    const relationshipById = new Map<string, OrgChartRelationshipToViewer>()
    if (viewerAssignment?.managerId) relationshipById.set(viewerAssignment.managerId, 'manager')
    relationshipById.set(viewerEmployment.id, 'self')
    for (const assignment of peerAssignments) {
      if (assignment.employmentId !== viewerEmployment.id) {
        relationshipById.set(assignment.employmentId, 'peer')
      }
    }
    for (const assignment of directReportAssignments) {
      relationshipById.set(assignment.employmentId, 'direct_report')
    }

    return {
      nodes: await this.buildNodes(uniqueIds, employments, assignments, relationshipById, tenantId),
      rootEmploymentIds: viewerAssignment?.managerId
        ? [viewerAssignment.managerId]
        : [viewerEmployment.id],
      focusEmploymentId: viewerEmployment.id,
    }
  }

  async getChildren(tenantId: string, employmentId: string): Promise<OrgChartNodeDto[]> {
    const parent = await this.employmentRepo.findById(employmentId, tenantId)
    if (!parent) throw new Error('ORG_CHART_NODE_NOT_FOUND')

    const childAssignments = await this.assignmentRepo.findCurrentByManagerId(
      employmentId,
      tenantId,
    )
    const childIds = childAssignments.map((assignment) => assignment.employmentId)
    const childEmployments = await this.employmentRepo.findManyByIds(childIds, tenantId)
    const childCurrentAssignments = await this.assignmentRepo.findCurrentMany(childIds, tenantId)
    return this.buildNodes(childIds, childEmployments, childCurrentAssignments, new Map(), tenantId)
  }

  private async getRootContext(tenantId: string): Promise<OrgChartContextDto> {
    const roots = await this.employmentRepo.findActiveRootEmployments(tenantId)
    const rootIds = roots.map((employment) => employment.id)
    const assignments = await this.assignmentRepo.findCurrentMany(rootIds, tenantId)
    const relationships = new Map<string, OrgChartRelationshipToViewer>(
      rootIds.map((id) => [id, 'root' as const]),
    )

    return {
      nodes: await this.buildNodes(rootIds, roots, assignments, relationships, tenantId),
      rootEmploymentIds: rootIds,
      focusEmploymentId: null,
    }
  }

  private async buildNodes(
    orderedIds: string[],
    employments: Employment[],
    assignments: JobAssignment[],
    relationshipById: Map<string, OrgChartRelationshipToViewer>,
    tenantId: string,
  ): Promise<OrgChartNodeDto[]> {
    const employmentById = new Map(employments.map((employment) => [employment.id, employment]))
    const assignmentByEmploymentId = new Map(
      assignments.map((assignment) => [assignment.employmentId, assignment]),
    )
    const nodes: OrgChartNodeDto[] = []

    for (const employmentId of orderedIds) {
      const employment = employmentById.get(employmentId)
      if (!employment) continue

      const assignment = assignmentByEmploymentId.get(employmentId)
      const displayResult = await this.directoryRepo.list(tenantId, { employmentId }, 1, 0)
      const display = displayResult.items[0] ?? null
      const directReportCount = await this.assignmentRepo.countCurrentByManagerId(
        employmentId,
        tenantId,
      )

      nodes.push({
        employmentId: employment.id,
        personProfileId: employment.personProfileId,
        fullName: display?.fullName ?? employment.employeeCode ?? 'Unnamed employee',
        jobTitle: display?.jobTitle ?? null,
        departmentName: display?.departmentName ?? null,
        locationName: display?.locationName ?? null,
        avatarUrl: null,
        managerEmploymentId: assignment?.managerId ?? null,
        directReportCount,
        hasDirectReports: directReportCount > 0,
        relationshipToViewer: relationshipById.get(employment.id),
      })
    }

    return nodes
  }
}
