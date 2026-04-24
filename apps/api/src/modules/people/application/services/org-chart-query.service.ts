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
  OrgChartTreeDto,
} from '../queries/org-chart.types'

export const ORG_CHART_NODE_NOT_FOUND = 'ORG_CHART_NODE_NOT_FOUND'

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
    if (!viewerAssignment) return this.getRootContext(tenantId)
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
      nodes: this.sortNodes(
        await this.buildNodes(uniqueIds, employments, assignments, relationshipById, tenantId),
        ['manager', 'self', 'peer', 'direct_report'],
      ),
      rootEmploymentIds: viewerAssignment?.managerId
        ? [viewerAssignment.managerId]
        : [viewerEmployment.id],
      focusEmploymentId: viewerEmployment.id,
    }
  }

  async getChildren(tenantId: string, employmentId: string): Promise<OrgChartNodeDto[]> {
    const parent = await this.employmentRepo.findById(employmentId, tenantId)
    if (!parent) throw new Error(ORG_CHART_NODE_NOT_FOUND)

    const childAssignments = await this.assignmentRepo.findCurrentByManagerId(
      employmentId,
      tenantId,
    )
    const childIds = childAssignments
      .map((assignment) => assignment.employmentId)
      .filter((childId) => childId !== employmentId)
    const childEmployments = await this.employmentRepo.findManyByIds(childIds, tenantId)
    const childCurrentAssignments = await this.assignmentRepo.findCurrentMany(childIds, tenantId)
    const nodes = await this.buildNodes(
      childIds,
      childEmployments,
      childCurrentAssignments,
      new Map(),
      tenantId,
    )

    return this.sortNodes(nodes, ['root'])
  }

  async getTree(
    tenantId: string,
    actorId: string,
    input: { teamId: string | null; depth: number },
  ): Promise<OrgChartTreeDto> {
    const context = await this.getContext(tenantId, actorId)
    const depth = Math.max(2, Math.min(input.depth, 5))
    const graph = await this.expandHierarchyGraph(
      tenantId,
      context.rootEmploymentIds,
      depth,
      input.teamId,
    )
    const employments = await this.employmentRepo.findManyByIds(
      graph.orderedEmploymentIds,
      tenantId,
    )
    const assignments = await this.assignmentRepo.findCurrentMany(
      graph.orderedEmploymentIds,
      tenantId,
    )
    const nodes = await this.buildNodes(
      graph.orderedEmploymentIds,
      employments,
      assignments,
      new Map(),
      tenantId,
    )
    return {
      rootIds: graph.rootIds,
      nodesById: Object.fromEntries(nodes.map((node) => [node.employmentId, node])),
      childrenByParentId: graph.childrenByParentId,
      focusEmploymentId: context.focusEmploymentId,
    }
  }

  private async expandHierarchyGraph(
    tenantId: string,
    rootIds: string[],
    depth: number,
    teamId: string | null,
  ): Promise<{
    rootIds: string[]
    orderedEmploymentIds: string[]
    childrenByParentId: Record<string, string[]>
  }> {
    const childrenByParentId: Record<string, string[]> = {}
    const orderedEmploymentIds: string[] = [...rootIds]
    const visited = new Set<string>(rootIds)
    let currentLevel = [...rootIds]

    for (let d = 0; d < depth - 1 && currentLevel.length > 0; d++) {
      const nextLevel: string[] = []
      for (const parentId of currentLevel) {
        const childAssignments = await this.assignmentRepo.findCurrentByManagerId(
          parentId,
          tenantId,
        )
        const childIds = childAssignments
          .filter((a) => a.employmentId !== parentId)
          .filter((a) => teamId === null || a.departmentId === teamId)
          .map((a) => a.employmentId)
          .filter((id) => !visited.has(id))

        if (childIds.length > 0) {
          childrenByParentId[parentId] = childIds
          for (const id of childIds) {
            visited.add(id)
            orderedEmploymentIds.push(id)
            nextLevel.push(id)
          }
        }
      }
      currentLevel = nextLevel
    }

    return { rootIds, orderedEmploymentIds, childrenByParentId }
  }

  private async getRootContext(tenantId: string): Promise<OrgChartContextDto> {
    const roots = await this.employmentRepo.findActiveRootEmployments(tenantId)
    const rootIds = roots.map((employment) => employment.id)
    const assignments = await this.assignmentRepo.findCurrentMany(rootIds, tenantId)
    const relationships = new Map<string, OrgChartRelationshipToViewer>(
      rootIds.map((id) => [id, 'root' as const]),
    )
    const nodes = this.sortNodes(
      await this.buildNodes(rootIds, roots, assignments, relationships, tenantId),
      ['root'],
    )

    return {
      nodes,
      rootEmploymentIds: nodes.map((node) => node.employmentId),
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

  private sortNodes(
    nodes: OrgChartNodeDto[],
    relationshipOrder: OrgChartRelationshipToViewer[],
  ): OrgChartNodeDto[] {
    const rankByRelationship = new Map(
      relationshipOrder.map((relationship, index) => [relationship, index]),
    )

    return [...nodes].sort((left, right) => {
      const leftRank =
        rankByRelationship.get(left.relationshipToViewer ?? 'root') ?? Number.MAX_SAFE_INTEGER
      const rightRank =
        rankByRelationship.get(right.relationshipToViewer ?? 'root') ?? Number.MAX_SAFE_INTEGER
      if (leftRank !== rightRank) return leftRank - rightRank

      const nameComparison = left.fullName.localeCompare(right.fullName, 'en')
      if (nameComparison !== 0) return nameComparison

      return left.employmentId.localeCompare(right.employmentId, 'en')
    })
  }
}
