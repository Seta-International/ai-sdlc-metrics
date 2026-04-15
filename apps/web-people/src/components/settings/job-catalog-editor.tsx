'use client'

import * as React from 'react'
import type { ColumnDef, CellContext } from '@tanstack/react-table'
import {
  DataTable,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Plus, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react'
import type { JobFamily, JobProfileRow } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const profileColumns: ColumnDef<JobProfileRow>[] = [
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  { accessorKey: 'level', header: 'Level', enableSorting: true },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }: CellContext<JobProfileRow, unknown>) => (
      <Badge variant={getValue() ? 'default' : 'subtle'}>
        {getValue() ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    accessorKey: 'assignmentCount',
    header: 'Assignments',
    cell: ({ getValue }: CellContext<JobProfileRow, unknown>) => (
      <span className="text-xs text-[#8a8f98]">{getValue() as number}</span>
    ),
  },
]

export function JobCatalogEditor() {
  const [families, setFamilies] = React.useState<JobFamily[]>([])
  const [selectedFamilyId, setSelectedFamilyId] = React.useState<string | null>(null)
  const [loadedProfiles, setLoadedProfiles] = React.useState<JobProfileRow[]>([])
  const profiles = selectedFamilyId ? loadedProfiles : []
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set())
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.settings.jobFamilies.list.query() as Promise<{
          families: JobFamily[]
        }>)
        setFamilies(result.families)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  React.useEffect(() => {
    if (!selectedFamilyId) return
    void (async () => {
      try {
        const result = await (anyTrpc.people.settings.jobProfiles.list.query({
          familyId: selectedFamilyId,
        }) as Promise<{ profiles: JobProfileRow[] }>)
        setLoadedProfiles(result.profiles)
      } catch {
        setLoadedProfiles([])
      }
    })()
  }, [selectedFamilyId])

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderFamilyTree(items: JobFamily[], depth = 0): React.ReactNode {
    return items.map((family) => {
      const isExpanded = expandedIds.has(family.id)
      const isSelected = selectedFamilyId === family.id
      const hasChildren = family.children && family.children.length > 0
      return (
        <div key={family.id}>
          <button
            type="button"
            onClick={() => {
              setSelectedFamilyId(family.id)
              if (hasChildren) toggleExpand(family.id)
            }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${isSelected ? 'bg-[rgba(255,255,255,0.08)] text-[#f7f8f8] font-[510]' : 'text-[#d0d6e0] hover:bg-[rgba(255,255,255,0.04)]'}`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )
            ) : (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#62666d]" />
            )}
            <span className="truncate">{family.name}</span>
            <Badge variant="subtle" className="ml-auto h-4 px-1 text-[10px]">
              {family.profileCount}
            </Badge>
          </button>
          {isExpanded && hasChildren && renderFamilyTree(family.children!, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="flex gap-6">
      <Card className="w-64 shrink-0 border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-[590] text-[#f7f8f8]">Job Families</h3>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <div className="text-xs text-[#62666d] py-4 text-center">Loading...</div>
          ) : (
            renderFamilyTree(families)
          )}
        </div>
      </Card>
      <div className="flex-1 min-w-0">
        {selectedFamilyId ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-[590] text-[#f7f8f8]">Job Profiles</h3>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm" className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Add Profile
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Job Profile</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Job title" />
                    <Input placeholder="Level (e.g., L1, Senior)" />
                    <Button className="w-full">Create</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <DataTable
              columns={profileColumns}
              rows={profiles}
              state={tableState}
              totalCount={profiles.length}
              onStateChange={setTableState}
              isLoading={false}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center py-16 text-sm text-[#62666d]">
            Select a job family to view profiles
          </div>
        )}
      </div>
    </div>
  )
}
