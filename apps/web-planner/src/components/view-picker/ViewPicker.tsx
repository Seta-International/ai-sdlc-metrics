'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@future/ui'
import { LayoutGrid, LayoutList, Calendar, PieChart } from 'lucide-react'
import type { ViewKey } from '@/lib/view-state'

export type ViewPickerFlags = { views: boolean; grid: boolean; schedule: boolean; charts: boolean }

const VIEWS: {
  key: ViewKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  flag: keyof ViewPickerFlags
}[] = [
  { key: 'board', label: 'Board', icon: LayoutGrid, flag: 'views' },
  { key: 'grid', label: 'Grid', icon: LayoutList, flag: 'grid' },
  { key: 'schedule', label: 'Schedule', icon: Calendar, flag: 'schedule' },
  { key: 'charts', label: 'Charts', icon: PieChart, flag: 'charts' },
]

export function ViewPicker({
  planId,
  currentView,
  flags,
}: {
  planId: string
  currentView: ViewKey
  flags: ViewPickerFlags
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const qs = sp.toString()

  return (
    <Tabs
      value={currentView}
      onValueChange={(v) =>
        router.replace(`/plans/${planId}/${v}${qs ? '?' + qs : ''}`, { scroll: false })
      }
    >
      <TabsList>
        {VIEWS.map(({ key, label, icon: Icon, flag }) => (
          <TabsTrigger key={key} value={key} disabled={!flags[flag]}>
            <Icon className="size-4" aria-hidden={true} />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
