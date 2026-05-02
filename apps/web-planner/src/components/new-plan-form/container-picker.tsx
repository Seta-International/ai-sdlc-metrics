'use client'

import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@future/ui'
import { trpc } from '../../lib/trpc'
import { msSyncKeys } from '../../lib/query-keys'

export type ContainerValue =
  | { containerType: 'future_only'; containerRef: null }
  | { containerType: 'ms_group'; containerRef: string }
  | { containerType: 'ms_roster'; containerRef: string }

interface ContainerPickerProps {
  value: ContainerValue
  onChange: (value: ContainerValue) => void
}

function encode(v: ContainerValue): string {
  if (v.containerType === 'future_only') return 'future_only'
  if (v.containerType === 'ms_group') return `ms_group:${v.containerRef}`
  return `ms_roster:${v.containerRef}`
}

function decode(s: string): ContainerValue {
  if (s === 'future_only') return { containerType: 'future_only', containerRef: null }
  if (s.startsWith('ms_group:'))
    return { containerType: 'ms_group', containerRef: s.slice('ms_group:'.length) }
  return { containerType: 'ms_roster', containerRef: s.slice('ms_roster:'.length) }
}

export function ContainerPicker({ value, onChange }: ContainerPickerProps) {
  const session = useSession()
  const { data: flags } = useQuery({
    queryKey: msSyncKeys.flags(session?.tenantId),
    queryFn: () => trpc.planner.msSync.flags.query({ tenantId: session!.tenantId }),
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  })
  const { data: linkedGroups = [] } = useQuery({
    queryKey: msSyncKeys.groupsLinked(session?.tenantId),
    queryFn: async (): Promise<Array<{ msGroupId: string; displayName: string }>> => {
      const result = await trpc.planner.msSync.groups.listLinked.query({
        tenantId: session!.tenantId,
      })
      return result as Array<{ msGroupId: string; displayName: string }>
    },
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  })
  const { data: linkedRosters = [] } = useQuery({
    queryKey: msSyncKeys.rostersLinked(session?.tenantId),
    queryFn: async (): Promise<Array<{ msRosterId: string; displayName: string }>> => {
      const result = await trpc.planner.msSync.rosters.listLinked.query({
        tenantId: session!.tenantId,
      })
      return result as Array<{ msRosterId: string; displayName: string }>
    },
    enabled: !!session && !!flags?.msSyncRostersEnabled,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Select value={encode(value)} onValueChange={(v) => onChange(decode(v))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="future_only">Future-only</SelectItem>
        </SelectGroup>
        {linkedGroups.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Microsoft 365 Groups</SelectLabel>
              {linkedGroups.map((group) => (
                <SelectItem key={group.msGroupId} value={`ms_group:${group.msGroupId}`}>
                  {group.displayName}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
        {linkedRosters.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Roster Plans</SelectLabel>
              {linkedRosters.map((roster) => (
                <SelectItem key={roster.msRosterId} value={`ms_roster:${roster.msRosterId}`}>
                  {roster.displayName}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  )
}
