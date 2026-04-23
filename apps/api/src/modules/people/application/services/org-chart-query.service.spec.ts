import { describe, expect, it, vi } from 'vitest'
import { OrgChartQueryService } from './org-chart-query.service'

const tenantId = '01900000-0000-7000-8000-000000000001'
const viewerActorId = '01900000-0000-7000-8000-000000000002'
const managerEmploymentId = '01900000-0000-7000-8000-000000000010'
const selfEmploymentId = '01900000-0000-7000-8000-000000000011'
const peerEmploymentId = '01900000-0000-7000-8000-000000000012'
const reportEmploymentId = '01900000-0000-7000-8000-000000000013'
const otherReportEmploymentId = '01900000-0000-7000-8000-000000000014'

function employment(id: string, personProfileId = `${id.slice(0, -1)}9`) {
  return {
    id,
    tenantId,
    personProfileId,
    employeeCode: id.slice(-4),
    employmentStatus: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function assignment(employmentId: string, managerId: string | null) {
  return {
    id: `${employmentId.slice(0, -1)}8`,
    tenantId,
    employmentId,
    jobProfileId: `${employmentId.slice(0, -1)}7`,
    managerId,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function directoryRepo(rows: Array<[string, string, string]>) {
  return {
    list: vi.fn().mockImplementation((_tenantId: string, filters: { employmentId?: string }) => {
      const match = rows.find(([employmentId]) => employmentId === filters.employmentId)
      return Promise.resolve({
        items: match
          ? [
              {
                employmentId: match[0],
                fullName: match[1],
                jobTitle: match[2],
                departmentName: 'Engineering',
                locationName: 'Singapore',
              },
            ]
          : [],
        total: match ? 1 : 0,
      })
    }),
  }
}

describe('OrgChartQueryService', () => {
  it('returns manager, self, peers, and direct reports for viewer context', async () => {
    const self = employment(selfEmploymentId)
    const manager = employment(managerEmploymentId)
    const peer = employment(peerEmploymentId)
    const report = employment(reportEmploymentId)

    const service = new OrgChartQueryService(
      {
        findActiveByActorId: vi.fn().mockResolvedValue(self),
        findManyByIds: vi.fn().mockResolvedValue([manager, self, peer, report]),
        findActiveRootEmployments: vi.fn(),
      } as never,
      {
        findCurrent: vi.fn().mockResolvedValue(assignment(selfEmploymentId, managerEmploymentId)),
        findCurrentByManagerId: vi
          .fn()
          .mockResolvedValueOnce([
            assignment(selfEmploymentId, managerEmploymentId),
            assignment(peerEmploymentId, managerEmploymentId),
          ])
          .mockResolvedValueOnce([assignment(reportEmploymentId, selfEmploymentId)]),
        findCurrentMany: vi
          .fn()
          .mockResolvedValue([
            assignment(managerEmploymentId, null),
            assignment(selfEmploymentId, managerEmploymentId),
            assignment(peerEmploymentId, managerEmploymentId),
            assignment(reportEmploymentId, selfEmploymentId),
          ]),
        countCurrentByManagerId: vi
          .fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
      } as never,
      directoryRepo([
        [managerEmploymentId, 'Morgan Manager', 'VP Engineering'],
        [selfEmploymentId, 'Sam Self', 'Senior Engineer'],
        [peerEmploymentId, 'Pat Peer', 'Designer'],
        [reportEmploymentId, 'Riley Report', 'Engineer'],
      ]) as never,
    )

    const result = await service.getContext(tenantId, viewerActorId)

    expect(result.focusEmploymentId).toBe(selfEmploymentId)
    expect(result.rootEmploymentIds).toEqual([managerEmploymentId])
    expect(result.nodes.map((node) => node.relationshipToViewer)).toEqual([
      'manager',
      'self',
      'peer',
      'direct_report',
    ])
    expect(result.nodes.find((node) => node.employmentId === selfEmploymentId)).toMatchObject({
      fullName: 'Sam Self',
      jobTitle: 'Senior Engineer',
      departmentName: 'Engineering',
      locationName: 'Singapore',
      directReportCount: 1,
      hasDirectReports: true,
    })
  })

  it('falls back to root nodes when the viewer has no active employment', async () => {
    const root = employment(managerEmploymentId)
    const service = new OrgChartQueryService(
      {
        findActiveByActorId: vi.fn().mockResolvedValue(null),
        findManyByIds: vi.fn().mockResolvedValue([root]),
        findActiveRootEmployments: vi.fn().mockResolvedValue([root]),
      } as never,
      {
        findCurrentMany: vi.fn().mockResolvedValue([assignment(managerEmploymentId, null)]),
        countCurrentByManagerId: vi.fn().mockResolvedValue(0),
      } as never,
      directoryRepo([[managerEmploymentId, 'Chris Root', 'CEO']]) as never,
    )

    const result = await service.getContext(tenantId, viewerActorId)

    expect(result.focusEmploymentId).toBeNull()
    expect(result.rootEmploymentIds).toEqual([managerEmploymentId])
    expect(result.nodes[0]).toMatchObject({
      relationshipToViewer: 'root',
      fullName: 'Chris Root',
      jobTitle: 'CEO',
    })
  })

  it('returns immediate children for lazy branch expansion', async () => {
    const report = employment(reportEmploymentId)
    const otherReport = employment(otherReportEmploymentId)
    const service = new OrgChartQueryService(
      {
        findById: vi.fn().mockResolvedValue(employment(selfEmploymentId)),
        findManyByIds: vi.fn().mockResolvedValue([report, otherReport]),
      } as never,
      {
        findCurrentByManagerId: vi
          .fn()
          .mockResolvedValue([
            assignment(reportEmploymentId, selfEmploymentId),
            assignment(otherReportEmploymentId, selfEmploymentId),
          ]),
        findCurrentMany: vi
          .fn()
          .mockResolvedValue([
            assignment(reportEmploymentId, selfEmploymentId),
            assignment(otherReportEmploymentId, selfEmploymentId),
          ]),
        countCurrentByManagerId: vi.fn().mockResolvedValue(0),
      } as never,
      directoryRepo([
        [reportEmploymentId, 'Riley Report', 'Engineer'],
        [otherReportEmploymentId, 'Jordan Report', 'Engineer'],
      ]) as never,
    )

    const result = await service.getChildren(tenantId, selfEmploymentId)

    expect(result).toHaveLength(2)
    expect(result.map((node) => node.managerEmploymentId)).toEqual([
      selfEmploymentId,
      selfEmploymentId,
    ])
    expect(result.map((node) => node.relationshipToViewer)).toEqual([undefined, undefined])
  })

  it('throws when lazy children are requested for a missing node', async () => {
    const service = new OrgChartQueryService(
      { findById: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      directoryRepo([]) as never,
    )

    await expect(service.getChildren(tenantId, selfEmploymentId)).rejects.toThrow(
      'ORG_CHART_NODE_NOT_FOUND',
    )
  })
})
