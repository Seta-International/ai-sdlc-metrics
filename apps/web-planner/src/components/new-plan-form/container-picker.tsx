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

export type ContainerValue =
  | { containerType: 'future_only'; containerRef: null }
  | { containerType: 'ms_group'; containerRef: string }

interface ContainerPickerProps {
  value: ContainerValue
  onChange: (value: ContainerValue) => void
}

function encode(v: ContainerValue): string {
  return v.containerType === 'future_only' ? 'future_only' : `ms_group:${v.containerRef}`
}

function decode(s: string): ContainerValue {
  if (s === 'future_only') return { containerType: 'future_only', containerRef: null }
  return { containerType: 'ms_group', containerRef: s.slice('ms_group:'.length) }
}

export function ContainerPicker({ value, onChange }: ContainerPickerProps) {
  const session = useSession()
  const { data: linkedGroups = [] } = useQuery({
    queryKey: ['msSync.groups.listLinked', session?.tenantId],
    queryFn: async (): Promise<Array<{ msGroupId: string; displayName: string }>> => {
      const result = await trpc.planner.msSync.groups.listLinked.query({
        tenantId: session!.tenantId,
      })
      return result as Array<{ msGroupId: string; displayName: string }>
    },
    enabled: !!session,
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
      </SelectContent>
    </Select>
  )
}
