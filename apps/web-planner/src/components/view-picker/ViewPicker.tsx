'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@future/ui'
import { LayoutGrid, LayoutList, Calendar, PieChart } from 'lucide-react'
import type { ViewKey } from '@/lib/view-state'

export type ViewPickerFlags = { views: boolean; grid: boolean; schedule: boolean; charts: boolean }

type ViewPickerProps =
  | { planId: string; currentView: ViewKey; flags: ViewPickerFlags }
  | { scope: 'personal'; currentView: ViewKey; basePath: string }

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

export function ViewPicker(props: ViewPickerProps) {
  const router = useRouter()
  const sp = useSearchParams()
  const qs = sp.toString()

  const isPersonal = 'scope' in props && props.scope === 'personal'

  function buildUrl(v: string): string {
    if (isPersonal) {
      const basePath = (props as { scope: 'personal'; basePath: string }).basePath
      return `${basePath}/${v}${qs ? '?' + qs : ''}`
    }
    const planId = (props as { planId: string }).planId
    return `/plans/${planId}/${v}${qs ? '?' + qs : ''}`
  }

  return (
    <Tabs
      value={props.currentView}
      onValueChange={(v) => router.replace(buildUrl(v), { scroll: false })}
    >
      <TabsList>
        {VIEWS.map(({ key, label, icon: Icon, flag }) => (
          <TabsTrigger
            key={key}
            value={key}
            disabled={isPersonal ? false : !(props as { flags: ViewPickerFlags }).flags[flag]}
          >
            <Icon className="size-4" aria-hidden={true} />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
