import * as React from 'react'
import { trpc } from '../trpc'
import type { OrgChartNode, OrgChartTree } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type UseOrgChartReturn = {
  visibleNodes: OrgChartNode[]
  nodesById: Map<string, OrgChartNode>
  childrenByParentId: Map<string, string[]>
  expandedIds: Set<string>
  rootEmploymentIds: string[]
  focusEmploymentId: string | null
  isLoadingContext: boolean
  contextError: string | null
  childLoadingIds: Set<string>
  childErrorsById: Map<string, string>
  selectedTeamId: string | null
  setSelectedTeamId: (teamId: string | null) => void
  availableTeams: Array<{ id: string; name: string }>
  expandNode: (employmentId: string) => Promise<void>
  collapseNode: (employmentId: string) => void
  retryContext: () => void
  retryChildren: (employmentId: string) => Promise<void>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load org chart'
}

export function useOrgChart(): UseOrgChartReturn {
  const [nodesById, setNodesById] = React.useState<Map<string, OrgChartNode>>(() => new Map())
  const [childrenByParentId, setChildrenByParentId] = React.useState<Map<string, string[]>>(
    () => new Map(),
  )
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set())
  const [rootEmploymentIds, setRootEmploymentIds] = React.useState<string[]>([])
  const [focusEmploymentId, setFocusEmploymentId] = React.useState<string | null>(null)
  const [isLoadingContext, setIsLoadingContext] = React.useState(true)
  const [contextError, setContextError] = React.useState<string | null>(null)
  const [childLoadingIds, setChildLoadingIds] = React.useState<Set<string>>(() => new Set())
  const [childErrorsById, setChildErrorsById] = React.useState<Map<string, string>>(() => new Map())
  const [contextReloadKey, setContextReloadKey] = React.useState(0)
  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoadingContext(true)
      setContextError(null)
      try {
        const result = (await anyTrpc.people.orgChart.tree.query({
          depth: 3,
          teamId: selectedTeamId ?? undefined,
        })) as OrgChartTree
        if (cancelled) return
        const nodesMap = new Map(Object.entries(result.nodesById))
        const childrenMap = new Map(Object.entries(result.childrenByParentId))
        setNodesById(nodesMap)
        setChildrenByParentId(childrenMap)
        setExpandedIds(new Set(result.rootIds))
        setRootEmploymentIds(result.rootIds)
        setFocusEmploymentId(result.focusEmploymentId)
      } catch (error) {
        if (!cancelled) setContextError(getErrorMessage(error))
      } finally {
        if (!cancelled) setIsLoadingContext(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contextReloadKey, selectedTeamId])

  const visibleNodes = React.useMemo(() => Array.from(nodesById.values()), [nodesById])

  async function expandNode(employmentId: string) {
    setExpandedIds((previous) => new Set(previous).add(employmentId))
    if (childrenByParentId.has(employmentId)) return

    setChildLoadingIds((previous) => new Set(previous).add(employmentId))
    setChildErrorsById((previous) => {
      const next = new Map(previous)
      next.delete(employmentId)
      return next
    })
    try {
      const children = (await anyTrpc.people.orgChart.children.query({
        employmentId,
      })) as OrgChartNode[]
      setNodesById((previous) => {
        const next = new Map(previous)
        for (const child of children) next.set(child.employmentId, child)
        return next
      })
      setChildrenByParentId((previous) => {
        const next = new Map(previous)
        next.set(
          employmentId,
          children.map((child) => child.employmentId),
        )
        return next
      })
    } catch (error) {
      setChildErrorsById((previous) => new Map(previous).set(employmentId, getErrorMessage(error)))
    } finally {
      setChildLoadingIds((previous) => {
        const next = new Set(previous)
        next.delete(employmentId)
        return next
      })
    }
  }

  function collapseNode(employmentId: string) {
    setExpandedIds((previous) => {
      const next = new Set(previous)
      next.delete(employmentId)
      return next
    })
  }

  return {
    visibleNodes,
    nodesById,
    childrenByParentId,
    expandedIds,
    rootEmploymentIds,
    focusEmploymentId,
    isLoadingContext,
    contextError,
    childLoadingIds,
    childErrorsById,
    selectedTeamId,
    setSelectedTeamId,
    availableTeams: [],
    expandNode,
    collapseNode,
    retryContext: () => setContextReloadKey((key) => key + 1),
    retryChildren: async (employmentId) => {
      setChildrenByParentId((previous) => {
        const next = new Map(previous)
        next.delete(employmentId)
        return next
      })
      await expandNode(employmentId)
    },
  }
}
