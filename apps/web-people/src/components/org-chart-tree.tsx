'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Input, Button } from '@future/ui'
import { Search, Minus, Plus, Maximize2 } from 'lucide-react'
import { OrgChartNodeComponent } from './org-chart-node'
import type { OrgChartNode } from '../lib/types'
import { trpc } from '../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type ViewMode = 'manager' | 'department'

export function OrgChartTree() {
  const router = useRouter()
  const [viewMode, setViewMode] = React.useState<ViewMode>('manager')
  const [search, setSearch] = React.useState('')
  const [tree, setTree] = React.useState<OrgChartNode[]>([])
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set())
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [zoom, setZoom] = React.useState(1)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.orgChart.tree.query({
          viewMode,
        }) as Promise<{ nodes: OrgChartNode[] }>)
        setTree(result.nodes)
        const firstLevelIds = new Set(result.nodes.map((n) => n.employmentId))
        setExpandedIds(firstLevelIds)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [viewMode])

  function handleToggle(employmentId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(employmentId)) next.delete(employmentId)
      else next.add(employmentId)
      return next
    })
  }

  function handleExpandAll() {
    const allIds = new Set<string>()
    function collectIds(nodes: OrgChartNode[]) {
      for (const n of nodes) {
        allIds.add(n.employmentId)
        if (n.children) collectIds(n.children)
      }
    }
    collectIds(tree)
    setExpandedIds(allIds)
  }

  function handleCollapseAll() {
    setExpandedIds(new Set())
  }

  function handleSearch() {
    if (!search.trim()) {
      setHighlightedId(null)
      return
    }
    const found = findNode(tree, search.toLowerCase())
    if (found) {
      setHighlightedId(found.employmentId)
      const ancestorIds = getAncestorIds(tree, found.employmentId)
      setExpandedIds((prev) => new Set([...prev, ...ancestorIds]))
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-foreground/60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Find person..."
              className="h-8 w-64 pl-8 text-xs"
            />
          </div>

          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => setViewMode('manager')}
              className={`rounded-l-md px-3 py-1.5 text-xs ${
                viewMode === 'manager'
                  ? 'bg-border text-foreground'
                  : 'text-secondary-foreground/60 hover:text-muted-foreground'
              }`}
            >
              By Manager
            </button>
            <button
              type="button"
              onClick={() => setViewMode('department')}
              className={`rounded-r-md px-3 py-1.5 text-xs ${
                viewMode === 'department'
                  ? 'bg-border text-foreground'
                  : 'text-secondary-foreground/60 hover:text-muted-foreground'
              }`}
            >
              By Department
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExpandAll} className="text-xs">
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={handleCollapseAll} className="text-xs">
            Collapse All
          </Button>
        </div>
      </div>

      {/* Tree canvas */}
      <div className="overflow-auto rounded-lg border border-border bg-[rgba(255,255,255,0.01)] p-8 min-h-content-lg">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Loading org chart...
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {tree.map((node) => (
                <OrgChartNodeComponent
                  key={node.employmentId}
                  node={node}
                  isHighlighted={highlightedId === node.employmentId}
                  onToggle={handleToggle}
                  onNavigate={(id) => router.push(`/profile/${id}`)}
                  expandedIds={expandedIds}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function findNode(nodes: OrgChartNode[], searchLower: string): OrgChartNode | null {
  for (const n of nodes) {
    if (n.fullName.toLowerCase().includes(searchLower)) return n
    if (n.children) {
      const found = findNode(n.children, searchLower)
      if (found) return found
    }
  }
  return null
}

function getAncestorIds(nodes: OrgChartNode[], targetId: string): string[] {
  const path: string[] = []
  function search(ns: OrgChartNode[]): boolean {
    for (const n of ns) {
      if (n.employmentId === targetId) return true
      if (n.children) {
        path.push(n.employmentId)
        if (search(n.children)) return true
        path.pop()
      }
    }
    return false
  }
  search(nodes)
  return path
}
