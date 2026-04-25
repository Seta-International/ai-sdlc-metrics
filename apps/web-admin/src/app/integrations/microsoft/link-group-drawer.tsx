'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@future/api-client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
  Input,
  Spinner,
} from '@future/ui'
import { trpc } from '../../../lib/trpc'

export interface AvailableGroupDto {
  externalGroupId: string
  displayName: string
  memberCount: number
}

interface PlannerMsGroupsTrpcSlice {
  listAvailable: { query: (input: { tenantId: string }) => Promise<AvailableGroupDto[]> }
  link: {
    mutate: (input: {
      tenantId: string
      actorId: string
      msGroupId: string
    }) => Promise<{ linkedGroupId: string; backfillJobId: string }>
  }
}

export interface LinkGroupDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  actorId: string
  onLinked: () => void
  onBackfillStarted: (jobId: string) => void
}

export function LinkGroupDrawer({
  open,
  onOpenChange,
  tenantId,
  actorId,
  onLinked,
  onBackfillStarted,
}: LinkGroupDrawerProps) {
  const [search, setSearch] = useState('')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plannerGroups = (trpc.planner as any).msSync.groups as PlannerMsGroupsTrpcSlice

  const availableQuery = useQuery({
    queryKey: ['planner.msSync.groups.listAvailable', tenantId],
    queryFn: () => plannerGroups.listAvailable.query({ tenantId }),
    enabled: open,
  })

  const linkMutation = useMutation({
    mutationFn: (msGroupId: string) => plannerGroups.link.mutate({ tenantId, actorId, msGroupId }),
  })

  const filteredGroups = useMemo(() => {
    const groups = availableQuery.data ?? []
    if (!search.trim()) return groups
    const lower = search.toLowerCase()
    return groups.filter((g) => g.displayName.toLowerCase().includes(lower))
  }, [availableQuery.data, search])

  function toggleGroup(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleLink() {
    const ids = Array.from(checkedIds)
    let lastJobId: string | null = null
    for (const msGroupId of ids) {
      const result = await linkMutation.mutateAsync(msGroupId)
      lastJobId = result.backfillJobId
    }
    setCheckedIds(new Set())
    onLinked()
    onOpenChange(false)
    if (lastJobId) {
      onBackfillStarted(lastJobId)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Link Microsoft 365 Group</SheetTitle>
          <SheetDescription>
            Select one or more groups to link and start backfilling their plans.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          <Input
            placeholder="Search groups…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search groups"
          />

          {availableQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading available groups…
            </div>
          )}

          {!availableQuery.isLoading && (
            <ul className="space-y-2">
              {filteredGroups.map((group) => (
                <li key={group.externalGroupId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`group-${group.externalGroupId}`}
                    checked={checkedIds.has(group.externalGroupId)}
                    onChange={() => toggleGroup(group.externalGroupId)}
                    className="size-4 accent-primary"
                  />
                  <label htmlFor={`group-${group.externalGroupId}`} className="text-sm">
                    {group.displayName}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({group.memberCount} members)
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <Button
            onClick={() => void handleLink()}
            disabled={checkedIds.size === 0 || linkMutation.isPending}
          >
            {linkMutation.isPending && <Spinner className="size-4" />}
            Link
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
